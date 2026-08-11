package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type CalendarService struct{}

// NewCalendarService 创建日历记录服务，封装吃饭记录、附件、留言和月度统计。
func NewCalendarService() *CalendarService {
	return &CalendarService{}
}

// CreateRecord 创建日历记录：校验组合权限和日期格式后，用事务写入记录、照片和首条留言。
func (s *CalendarService) CreateRecord(ctx context.Context, uid uuid.UUID, req CreateRecordReq) (*model.CalendarRecord, error) {
	if err := CanAccessGroup(ctx, uid, req.GroupType, req.GroupID); err != nil {
		return nil, err
	}

	recordDate, err := time.Parse("2006-01-02", req.RecordDate)
	if err != nil {
		return nil, errors.New("日期格式错误，应为 YYYY-MM-DD")
	}

	record := model.CalendarRecord{
		UserID:     uid,
		GroupType:  req.GroupType,
		GroupID:    req.GroupID,
		RecordDate: recordDate,
		MealType:   req.MealType,
		MealPeriod: req.MealPeriod,
		Restaurant: req.Restaurant,
		Source:     "manual",
	}

	if req.DishIDs != nil {
		record.DishIDs = pq.StringArray(req.DishIDs)
	}
	if req.Amount != nil {
		record.Amount = req.Amount
	}

	tx := database.DB.Begin()

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
	if err := database.DB.Where("id = ? AND user_id = ?", recordID, uid).First(&record).Error; err != nil {
		return errors.New("记录不存在")
	}

	tx := database.DB.Begin()
	updated := false
	if req.MealType != "" {
		if err := tx.Model(&record).Update("meal_type", req.MealType).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.MealPeriod != "" {
		if err := tx.Model(&record).Update("meal_period", req.MealPeriod).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Restaurant != "" {
		if err := tx.Model(&record).Update("restaurant", req.Restaurant).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Amount != nil {
		if err := tx.Model(&record).Update("amount", *req.Amount).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}

	if !updated {
		tx.Rollback()
		return nil
	}

	return tx.Commit().Error
}

// DeleteRecord 删除日历记录
func (s *CalendarService) DeleteRecord(ctx context.Context, uid uuid.UUID, recordID uuid.UUID) error {
	result := database.DB.Where("id = ? AND user_id = ?", recordID, uid).Delete(&model.CalendarRecord{})
	if result.RowsAffected == 0 {
		return errors.New("记录不存在")
	}
	return result.Error
}

// GetRecord 获取记录详情
func (s *CalendarService) GetRecord(ctx context.Context, uid uuid.UUID, recordID uuid.UUID) (*model.CalendarRecord, error) {
	if _, err := CanAccessRecord(ctx, uid, recordID); err != nil {
		return nil, errors.New("记录不存在")
	}

	var record model.CalendarRecord
	if err := database.DB.Preload("Photos").Preload("Comments").First(&record, "id = ?", recordID).Error; err != nil {
		return nil, errors.New("记录不存在")
	}
	return &record, nil
}

// ListRecords 按月份获取日历记录：按 [月初, 下月初) 查询，避免月底日期边界问题。
func (s *CalendarService) ListRecords(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID, year, month int) ([]model.CalendarRecord, error) {
	var records []model.CalendarRecord
	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, err
	}

	startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
	endDate := startDate.AddDate(0, 1, 0)

	if err := database.DB.Preload("Photos").Preload("Comments").
		Where("group_type = ? AND group_id = ? AND record_date >= ? AND record_date < ?", groupType, groupID, startDate, endDate).
		Order("record_date ASC, created_at ASC").
		Find(&records).Error; err != nil {
		return nil, err
	}

	return records, nil
}

// ListRecordsByDate 按日期获取记录：用于日历某一天详情，日期格式错误返回业务错误。
func (s *CalendarService) ListRecordsByDate(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID, date string) ([]model.CalendarRecord, error) {
	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, err
	}
	recordDate, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, errors.New("日期格式错误，应为 YYYY-MM-DD")
	}

	var records []model.CalendarRecord
	if err := database.DB.Preload("Photos").Preload("Comments").
		Where("group_type = ? AND group_id = ? AND record_date = ?", groupType, groupID, recordDate).
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

type MonthlyStatsResult struct {
	TotalAmount    float64        `json:"total_amount"`
	MealCount      map[string]int `json:"meal_count"`
	TotalRecords   int            `json:"total_records"`
	UnrecordedDays []string       `json:"unrecorded_days"`
	Year           int            `json:"year"`
	Month          int            `json:"month"`
}

// GetMonthlyStats 获取月度统计：按月份聚合消费金额、餐型次数和缺少金额的日期。
func (s *CalendarService) GetMonthlyStats(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID, year, month int) (*MonthlyStatsResult, error) {
	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, err
	}

	startDate := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.Local)
	endDate := startDate.AddDate(0, 1, 0)

	var records []model.CalendarRecord
	database.DB.Where("group_type = ? AND group_id = ? AND record_date >= ? AND record_date < ?", groupType, groupID, startDate, endDate).Find(&records)

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

type CreateRecordReq struct {
	GroupType  string     `json:"group_type" binding:"required,oneof=couple buddy"`
	GroupID    uuid.UUID  `json:"group_id" binding:"required"`
	RecordDate string     `json:"record_date" binding:"required"` // YYYY-MM-DD
	MealType   string     `json:"meal_type" binding:"required,oneof=cook takeout dineout"`
	MealPeriod string     `json:"meal_period"` // breakfast / lunch / dinner / snack
	DishIDs    []string   `json:"dish_ids"`
	Restaurant string     `json:"restaurant"`
	Amount     *float64   `json:"amount"`
	Photos     []PhotoReq `json:"photos"`
	Content    string     `json:"content"`
}

type PhotoReq struct {
	URL  string `json:"url" binding:"required"`
	Type string `json:"type"` // image / video
}

type UpdateRecordReq struct {
	MealType   string   `json:"meal_type"`
	MealPeriod string   `json:"meal_period"`
	Restaurant string   `json:"restaurant"`
	Amount     *float64 `json:"amount"`
}
