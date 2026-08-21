package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// CalendarService 管理餐桌日历记录、照片、留言和月度聚合统计。
type CalendarService struct{}

type calendarRequestError struct {
	err error
}

func (e *calendarRequestError) Error() string { return e.err.Error() }
func (e *calendarRequestError) Unwrap() error { return e.err }

func newCalendarRequestError(err error) error {
	return &calendarRequestError{err: err}
}

// IsCalendarRequestError 判断日历写操作失败是否由请求内容或业务校验导致。
func IsCalendarRequestError(err error) bool {
	var requestErr *calendarRequestError
	return errors.As(err, &requestErr) || IsAmountValidationError(err)
}

// IsCalendarNotFoundError 判断日历写操作是否因资源不存在或不可见而失败。
func IsCalendarNotFoundError(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, ErrNotFound)
}

// OptionalAmount 区分 JSON 字段缺省、显式 null 和数字三种输入。
type OptionalAmount struct {
	Set   bool
	Value *float64
}

func (a *OptionalAmount) UnmarshalJSON(data []byte) error {
	a.Set = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		a.Value = nil
		return nil
	}
	var value float64
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	a.Value = &value
	return nil
}

// OptionalString 区分 JSON 字段缺省和显式字符串（包括空字符串）两种输入。
type OptionalString struct {
	Set   bool
	Value string
}

func (s *OptionalString) UnmarshalJSON(data []byte) error {
	s.Set = true
	return json.Unmarshal(data, &s.Value)
}

type CalendarOrderItemDetail struct {
	ID              uuid.UUID `json:"id"`
	DishID          uuid.UUID `json:"dish_id"`
	DishName        string    `json:"dish_name"`
	Quantity        int       `json:"quantity"`
	UnitPrice       *float64  `json:"unit_price"`
	ConfirmedAmount *float64  `json:"confirmed_amount"`
}

type CalendarOrderDetail struct {
	ID    uuid.UUID                 `json:"id"`
	Items []CalendarOrderItemDetail `json:"items"`
}

type CalendarRecordDetail struct {
	model.CalendarRecord
	Order *CalendarOrderDetail `json:"order,omitempty"`
}

// NewCalendarService 创建日历记录服务，封装吃饭记录、附件、留言和月度统计。
func NewCalendarService() *CalendarService {
	return &CalendarService{}
}

// CreateRecord 创建日历记录：校验餐桌权限和日期格式后，用事务写入记录、照片和首条留言。
func (s *CalendarService) CreateRecord(ctx context.Context, uid uuid.UUID, req CreateRecordReq) (*model.CalendarRecord, error) {
	if err := CanAccessTable(ctx, uid, req.TableID); err != nil {
		return nil, err
	}
	amount, err := normalizeAmount(req.Amount)
	if err != nil {
		return nil, err
	}

	recordDate, err := time.Parse("2006-01-02", req.RecordDate)
	if err != nil {
		return nil, newCalendarRequestError(errors.New("日期格式错误，应为 YYYY-MM-DD"))
	}

	record := model.CalendarRecord{
		UserID:     uid,
		TableID:    req.TableID,
		RecordDate: recordDate,
		MealType:   req.MealType,
		MealPeriod: req.MealPeriod,
		Restaurant: req.Restaurant,
		Source:     "manual",
		Status:     "confirmed",
	}

	if req.DishIDs != nil {
		record.DishIDs = pq.StringArray(req.DishIDs)
	}
	record.Amount = amount

	tx := database.DB.WithContext(ctx).Begin()

	if err := tx.Create(&record).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建记录失败: %w", err)
	}

	// 添加照片
	for i, photo := range req.Photos {
		rp := model.RecordPhoto{
			RecordID:  record.ID,
			URL:       photo.URL,
			Type:      photo.Type,
			SortOrder: i,
		}
		if rp.Type == "" {
			rp.Type = "image"
		}
		if err := tx.Create(&rp).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("添加照片失败: %w", err)
		}
	}

	// 添加留言
	if req.Content != "" {
		comment := model.RecordComment{
			RecordID: record.ID,
			UserID:   uid,
			Content:  req.Content,
		}
		if err := tx.Create(&comment).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("添加留言失败: %w", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	// 重新加载
	database.DB.Preload("Photos").Preload("Comments").First(&record, "id = ?", record.ID)
	return &record, nil
}

// UpdateRecord 更新日历记录：仅创建人可修改，空更新保持幂等返回 nil。
func (s *CalendarService) UpdateRecord(ctx context.Context, uid uuid.UUID, recordID uuid.UUID, req UpdateRecordReq) error {
	var record model.CalendarRecord
	if err := database.DB.WithContext(ctx).Where("id = ? AND user_id = ?", recordID, uid).First(&record).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return newCalendarRequestError(errors.New("记录不存在"))
		}
		return err
	}

	return database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		recordQuery := tx.Model(&model.CalendarRecord{}).Where("id = ?", record.ID)
		hasUpdates := false
		if req.MealType != "" {
			if err := recordQuery.Update("meal_type", req.MealType).Error; err != nil {
				return err
			}
			hasUpdates = true
		}
		if req.MealPeriod != "" {
			if err := recordQuery.Update("meal_period", req.MealPeriod).Error; err != nil {
				return err
			}
			hasUpdates = true
		}
		if req.Restaurant.Set {
			if err := recordQuery.Update("restaurant", req.Restaurant.Value).Error; err != nil {
				return err
			}
			hasUpdates = true
		}

		switch record.Source {
		case "manual":
			if len(req.OrderItems) > 0 {
				return newCalendarRequestError(errors.New("手工记录不能提交订单项金额"))
			}
			if req.Amount.Set {
				amount, err := normalizeAmount(req.Amount.Value)
				if err != nil {
					return err
				}
				if err := recordQuery.Update("amount", amount).Error; err != nil {
					return err
				}
				hasUpdates = true
			}
		case "order":
			if req.Amount.Set {
				return newCalendarRequestError(errors.New("订单来源记录不能直接修改本餐总金额"))
			}
			if err := updateCalendarOrderAmounts(tx, record, req.OrderItems); err != nil {
				return err
			}
		default:
			return newCalendarRequestError(errors.New("记录来源无效"))
		}

		if !hasUpdates {
			return nil
		}
		return nil
	})
}

func updateCalendarOrderAmounts(tx *gorm.DB, record model.CalendarRecord, requested []UpdateOrderItemAmountReq) error {
	var order model.Order
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("calendar_record_id = ?", record.ID).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return newCalendarRequestError(errors.New("关联订单不存在"))
		}
		return err
	}
	seen := make(map[uuid.UUID]struct{}, len(requested))
	for _, item := range requested {
		if _, exists := seen[item.ID]; exists {
			return newCalendarRequestError(errors.New("请求包含重复订单项"))
		}
		seen[item.ID] = struct{}{}
		if !item.ConfirmedAmount.Set {
			return newCalendarRequestError(errors.New("订单项确认金额不能为空"))
		}
		amount, err := normalizeAmount(item.ConfirmedAmount.Value)
		if err != nil {
			return fmt.Errorf("确认金额无效: %w", err)
		}
		result := tx.Model(&model.OrderItem{}).
			Where("id = ? AND order_id = ?", item.ID, order.ID).
			Update("confirmed_amount", amount)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return newCalendarRequestError(errors.New("请求包含无效订单项"))
		}
	}

	var items []model.OrderItem
	if err := tx.Where("order_id = ?", order.ID).Find(&items).Error; err != nil {
		return err
	}
	values := make([]*float64, 0, len(items))
	for _, item := range items {
		values = append(values, item.ConfirmedAmount)
	}
	total := sumAmounts(values)
	if err := validateAmountTotal(total); err != nil {
		return newCalendarRequestError(fmt.Errorf("订单总金额无效: %w", err))
	}
	if err := tx.Model(&model.Order{}).Where("id = ?", order.ID).
		Select("total_amount").Updates(model.Order{TotalAmount: total}).Error; err != nil {
		return err
	}
	return tx.Model(&model.CalendarRecord{}).Where("id = ?", record.ID).
		Select("amount").Updates(model.CalendarRecord{Amount: total}).Error
}

// DeleteRecord 删除日历记录
func (s *CalendarService) DeleteRecord(ctx context.Context, uid uuid.UUID, recordID uuid.UUID) error {
	result := database.DB.Where("id = ? AND user_id = ?", recordID, uid).Delete(&model.CalendarRecord{})
	if result.RowsAffected == 0 {
		return errors.New("记录不存在")
	}
	return result.Error
}

// GetRecord 获取记录详情；订单来源同时返回可编辑的订单项金额。
func (s *CalendarService) GetRecord(ctx context.Context, uid uuid.UUID, recordID uuid.UUID) (*CalendarRecordDetail, error) {
	if _, err := CanAccessRecord(ctx, uid, recordID); err != nil {
		return nil, errors.New("记录不存在")
	}

	var record model.CalendarRecord
	if err := database.DB.WithContext(ctx).Preload("Photos").Preload("Comments").First(&record, "id = ?", recordID).Error; err != nil {
		return nil, errors.New("记录不存在")
	}
	detail := &CalendarRecordDetail{CalendarRecord: record}
	if record.Source != "order" {
		return detail, nil
	}

	var order model.Order
	if err := database.DB.WithContext(ctx).Where("calendar_record_id = ?", record.ID).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("关联订单不存在: %w", gorm.ErrRecordNotFound)
		}
		return nil, err
	}
	var items []CalendarOrderItemDetail
	result := database.DB.WithContext(ctx).
		Table("order_items").
		Select("order_items.id, order_items.dish_id, COALESCE(dishes.name, '') AS dish_name, order_items.quantity, order_items.unit_price, order_items.confirmed_amount").
		Joins("LEFT JOIN dishes ON dishes.id = order_items.dish_id").
		Where("order_items.order_id = ?", order.ID).
		Order("order_items.id ASC").
		Scan(&items)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, fmt.Errorf("关联订单项不存在: %w", gorm.ErrRecordNotFound)
	}
	detail.Order = &CalendarOrderDetail{ID: order.ID, Items: items}
	return detail, nil
}

// ListRecords 按月份获取日历记录：按 [月初, 下月初) 查询，避免月底日期边界问题。
func (s *CalendarService) ListRecords(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, status string, year, month int) ([]model.CalendarRecord, error) {
	var records []model.CalendarRecord
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}

	startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
	endDate := startDate.AddDate(0, 1, 0)

	query := database.DB.Preload("Photos").Preload("Comments").
		Where("table_id = ? AND record_date >= ? AND record_date < ?", tableID, startDate, endDate)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.
		Order("record_date ASC, created_at ASC").
		Find(&records).Error; err != nil {
		return nil, err
	}

	return records, nil
}

// ListRecordsByDate 按日期获取记录：用于日历某一天详情，日期格式错误返回业务错误。
func (s *CalendarService) ListRecordsByDate(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, status string, date string) ([]model.CalendarRecord, error) {
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}
	recordDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, errors.New("日期格式错误，应为 YYYY-MM-DD")
	}

	var records []model.CalendarRecord
	query := database.DB.Preload("Photos").Preload("Comments").
		Where("table_id = ? AND record_date = ?", tableID, recordDate)
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if err := query.
		Order("created_at ASC").
		Find(&records).Error; err != nil {
		return nil, err
	}

	return records, nil
}

// AddComment 添加留言：只要用户可访问记录所属组合即可追加留言。
func (s *CalendarService) AddComment(ctx context.Context, uid uuid.UUID, recordID uuid.UUID, content string) (*model.RecordComment, error) {
	if _, err := CanAccessRecord(ctx, uid, recordID); err != nil {
		return nil, errors.New("记录不存在")
	}

	comment := model.RecordComment{
		RecordID: recordID,
		UserID:   uid,
		Content:  content,
	}
	if err := database.DB.Create(&comment).Error; err != nil {
		return nil, fmt.Errorf("添加留言失败: %w", err)
	}
	return &comment, nil
}

// AddPhoto 添加照片/视频：当前仅创建人可追加附件，并按已有数量写入排序序号。
func (s *CalendarService) AddPhoto(ctx context.Context, uid uuid.UUID, recordID uuid.UUID, url, fileType string) (*model.RecordPhoto, error) {
	var record model.CalendarRecord
	if err := database.DB.Where("id = ? AND user_id = ?", recordID, uid).First(&record).Error; err != nil {
		return nil, errors.New("记录不存在")
	}

	if fileType == "" {
		fileType = "image"
	}

	// 获取当前排序
	var count int64
	database.DB.Model(&model.RecordPhoto{}).Where("record_id = ?", recordID).Count(&count)

	photo := model.RecordPhoto{
		RecordID:  recordID,
		URL:       url,
		Type:      fileType,
		SortOrder: int(count),
	}
	if err := database.DB.Create(&photo).Error; err != nil {
		return nil, fmt.Errorf("添加照片失败: %w", err)
	}
	return &photo, nil
}

// MonthlyStatsResult 是月度统计响应体，面向前端预算和补录提醒展示。
type MonthlyStatsResult struct {
	TotalAmount    float64        `json:"total_amount"`    // 当月已记录金额合计
	MealCount      map[string]int `json:"meal_count"`      // cook/takeout/dineout 次数
	TotalRecords   int            `json:"total_records"`   // 当月记录总数
	UnrecordedDays []string       `json:"unrecorded_days"` // 有记录但未填写金额的日期
	Year           int            `json:"year"`            // 统计年份
	Month          int            `json:"month"`           // 统计月份
}

// GetMonthlyStats 获取月度统计：按月份聚合消费金额、餐型次数和缺少金额的日期。
func (s *CalendarService) GetMonthlyStats(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, year, month int) (*MonthlyStatsResult, error) {
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}

	startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
	endDate := startDate.AddDate(0, 1, 0)

	var records []model.CalendarRecord
	database.DB.Where("table_id = ? AND record_date >= ? AND record_date < ?", tableID, startDate, endDate).Find(&records)

	var totalAmount float64
	var unrecordedDays []string
	mealCount := map[string]int{"cook": 0, "takeout": 0, "dineout": 0}
	recordedDays := make(map[string]bool)

	for _, r := range records {
		mealCount[r.MealType]++
		if r.Amount != nil {
			totalAmount += *r.Amount
		} else {
			unrecordedDays = append(unrecordedDays, r.RecordDate.Format("2006-01-02"))
		}
		recordedDays[r.RecordDate.Format("2006-01-02")] = true
	}

	return &MonthlyStatsResult{
		TotalAmount:    totalAmount,
		MealCount:      mealCount,
		TotalRecords:   len(records),
		UnrecordedDays: unrecordedDays,
		Year:           year,
		Month:          month,
	}, nil
}

// ---- 请求结构：日期字段使用字符串承接 HTTP JSON，再在 service 中统一解析 ----

// CreateRecordReq 是新建日历记录请求，日期由服务层解析为 time.Time。
type CreateRecordReq struct {
	TableID    uuid.UUID  `json:"table_id" binding:"required"`                             // 目标餐桌 ID
	RecordDate string     `json:"record_date" binding:"required"`                          // 日期，格式 YYYY-MM-DD
	MealType   string     `json:"meal_type" binding:"required,oneof=cook takeout dineout"` // 餐型
	MealPeriod string     `json:"meal_period"`                                             // breakfast / lunch / dinner / snack
	DishIDs    []string   `json:"dish_ids"`                                                // 关联菜品 ID 列表
	Restaurant string     `json:"restaurant"`                                              // 外卖/堂食餐厅
	Amount     *float64   `json:"amount"`                                                  // 本餐金额，可为空
	Photos     []PhotoReq `json:"photos"`                                                  // 初始照片列表
	Content    string     `json:"content"`                                                 // 创建时附带的首条留言
}

// PhotoReq 是记录照片请求项，Type 为空时服务层默认 image。
type PhotoReq struct {
	URL  string `json:"url" binding:"required"` // 图片或视频 URL
	Type string `json:"type"`                   // image / video
}

// UpdateRecordReq 是日历记录局部更新请求，缺省字段表示不更新。
type UpdateRecordReq struct {
	MealType   string                     `json:"meal_type"`   // 餐型
	MealPeriod string                     `json:"meal_period"` // 餐段
	Restaurant OptionalString             `json:"restaurant"`  // 缺省不更新，空字符串显式清空
	Amount     OptionalAmount             `json:"amount"`      // 缺省不更新，null 显式清空
	OrderItems []UpdateOrderItemAmountReq `json:"order_items"` // 订单来源记录的逐项确认金额
}

type UpdateOrderItemAmountReq struct {
	ID              uuid.UUID      `json:"id" binding:"required"`
	ConfirmedAmount OptionalAmount `json:"confirmed_amount"`
}
