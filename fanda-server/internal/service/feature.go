package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

type FeatureService struct{}

// NewFeatureService 创建扩展功能服务，聚合轻量但共用鉴权规则的业务能力。
func NewFeatureService() *FeatureService {
	return &FeatureService{}
}

// ---- 心愿清单 ----

// CreateWish 创建心愿：先确认当前用户可访问目标组合，再写入个人创建的心愿。
func (s *FeatureService) CreateWish(ctx context.Context, uid uuid.UUID, req CreateWishReq) (*model.WishItem, error) {
	if err := CanAccessGroup(ctx, uid, req.GroupType, req.GroupID); err != nil {
		return nil, err
	}

	wish := model.WishItem{
		UserID:    uid,
		GroupType: req.GroupType,
		GroupID:   req.GroupID,
		Name:      req.Name,
		Note:      req.Note,
	}
	if req.DishID != nil {
		wish.DishID = req.DishID
	}
	if err := database.DB.Create(&wish).Error; err != nil {
		return nil, fmt.Errorf("创建心愿失败: %w", err)
	}
	return &wish, nil
}

// ListWishes 获取心愿列表：组合鉴权后可按完成状态过滤。
func (s *FeatureService) ListWishes(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID, completed *bool) ([]model.WishItem, error) {
	var wishes []model.WishItem
	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, err
	}
	query := database.DB.Where("group_type = ? AND group_id = ?", groupType, groupID)
	if completed != nil {
		query = query.Where("is_completed = ?", *completed)
	}
	if err := query.Order("created_at DESC").Find(&wishes).Error; err != nil {
		return nil, err
	}
	return wishes, nil
}

// CompleteWish 完成心愿：按 user_id 限制为创建者操作，避免组内成员互相修改。
func (s *FeatureService) CompleteWish(ctx context.Context, uid uuid.UUID, wishID uuid.UUID) error {
	result := database.DB.Model(&model.WishItem{}).
		Where("id = ? AND user_id = ?", wishID, uid).
		Update("is_completed", true)
	if result.RowsAffected == 0 {
		return errors.New("心愿不存在")
	}
	return result.Error
}

// DeleteWish 删除心愿
func (s *FeatureService) DeleteWish(ctx context.Context, uid uuid.UUID, wishID uuid.UUID) error {
	result := database.DB.Where("id = ? AND user_id = ?", wishID, uid).Delete(&model.WishItem{})
	if result.RowsAffected == 0 {
		return errors.New("心愿不存在")
	}
	return result.Error
}

// ---- 签到 ----

// Checkin 签到：同一天只允许一次，连续签到在事务中同时写签到、积分和流水。
func (s *FeatureService) Checkin(ctx context.Context, uid uuid.UUID) (map[string]interface{}, error) {
	today := time.Now().Format("2006-01-02")
	todayDate, _ := time.Parse("2006-01-02", today)

	// 检查今日是否已签到
	var existing model.Checkin
	if err := database.DB.Where("user_id = ? AND checkin_date = ?", uid, todayDate).First(&existing).Error; err == nil {
		return nil, errors.New("今日已签到")
	}

	points := 1
	// 连续签到奖励：昨天签到过则额外+1
	yesterday := todayDate.AddDate(0, 0, -1)
	var yesterdayCheckin model.Checkin
	if err := database.DB.Where("user_id = ? AND checkin_date = ?", uid, yesterday).First(&yesterdayCheckin).Error; err == nil {
		points = 2
	}

	tx := database.DB.Begin()

	checkin := model.Checkin{
		UserID:      uid,
		CheckinDate: todayDate,
		Points:      points,
	}
	if err := tx.Create(&checkin).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("签到失败: %w", err)
	}

	// 更新用户积分和记录流水必须与签到记录同事务提交，避免积分与签到状态不一致。
	if err := tx.Model(&model.User{}).Where("uid = ?", uid).UpdateColumn("points", tx.Raw("points + ?", points)).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("更新积分失败: %w", err)
	}

	// 记录积分历史
	pr := model.PointRecord{
		UserID: uid,
		Points: points,
		Reason: "每日签到",
	}
	if err := tx.Create(&pr).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("记录积分历史失败: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"points":       points,
		"checkin_date": today,
	}, nil
}

// GetCheckinStatus 获取签到状态：计算今日是否签到、本月次数和从今天/昨天回溯的连续天数。
func (s *FeatureService) GetCheckinStatus(ctx context.Context, uid uuid.UUID) (map[string]interface{}, error) {
	today := time.Now().Format("2006-01-02")
	todayDate, _ := time.Parse("2006-01-02", today)

	// 今日是否签到
	var todayCheckin model.Checkin
	todayChecked := database.DB.Where("user_id = ? AND checkin_date = ?", uid, todayDate).First(&todayCheckin).Error == nil

	// 本月签到天数
	year, month, _ := time.Now().Date()
	startOfMonth := time.Date(year, month, 1, 0, 0, 0, 0, time.Local)
	var monthCount int64
	database.DB.Model(&model.Checkin{}).
		Where("user_id = ? AND checkin_date >= ?", uid, startOfMonth).
		Count(&monthCount)

	// 连续签到天数
	streak := 0
	checkDate := todayDate
	if !todayChecked {
		checkDate = checkDate.AddDate(0, 0, -1)
	}
	for {
		var c model.Checkin
		if err := database.DB.Where("user_id = ? AND checkin_date = ?", uid, checkDate).First(&c).Error; err != nil {
			break
		}
		streak++
		checkDate = checkDate.AddDate(0, 0, -1)
	}

	return map[string]interface{}{
		"today_checked": todayChecked,
		"month_count":   monthCount,
		"streak":        streak,
	}, nil
}

// ---- 菜篮子 ----

// AddToBasket 添加到菜篮子：数量缺省时写入 "1"，其余字段保持用户输入。
func (s *FeatureService) AddToBasket(ctx context.Context, uid uuid.UUID, req BasketReq) (*model.ShoppingBasket, error) {
	if err := CanAccessGroup(ctx, uid, req.GroupType, req.GroupID); err != nil {
		return nil, err
	}

	item := model.ShoppingBasket{
		UserID:    uid,
		GroupType: req.GroupType,
		GroupID:   req.GroupID,
		Name:      req.Name,
		Quantity:  req.Quantity,
	}
	if req.Quantity == "" {
		item.Quantity = "1"
	}
	if err := database.DB.Create(&item).Error; err != nil {
		return nil, fmt.Errorf("添加失败: %w", err)
	}
	return &item, nil
}

// ListBasket 获取菜篮子：未购买项排在前面，方便前端优先展示待采购内容。
func (s *FeatureService) ListBasket(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID) ([]model.ShoppingBasket, error) {
	var items []model.ShoppingBasket
	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, err
	}
	if err := database.DB.Where("group_type = ? AND group_id = ?", groupType, groupID).
		Order("is_purchased ASC, created_at DESC").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// ToggleBasketPurchased 切换购买状态
func (s *FeatureService) ToggleBasketPurchased(ctx context.Context, uid uuid.UUID, itemID uuid.UUID) error {
	var item model.ShoppingBasket
	if err := database.DB.Where("id = ? AND user_id = ?", itemID, uid).First(&item).Error; err != nil {
		return errors.New("物品不存在")
	}
	return database.DB.Model(&item).Update("is_purchased", !item.IsPurchased).Error
}

// DeleteBasket 删除菜篮子项
func (s *FeatureService) DeleteBasket(ctx context.Context, uid uuid.UUID, itemID uuid.UUID) error {
	result := database.DB.Where("id = ? AND user_id = ?", itemID, uid).Delete(&model.ShoppingBasket{})
	if result.RowsAffected == 0 {
		return errors.New("物品不存在")
	}
	return result.Error
}

// ---- 预算 ----

// SetBudget 设置预算：同一用户、组合和月份已有记录时更新，否则创建新预算。
func (s *FeatureService) SetBudget(ctx context.Context, uid uuid.UUID, req BudgetReq) (*model.BudgetSetting, error) {
	if err := CanAccessGroup(ctx, uid, req.GroupType, req.GroupID); err != nil {
		return nil, err
	}

	var budget model.BudgetSetting
	// 查找已有设置，存在则更新
	err := database.DB.Where("user_id = ? AND group_type = ? AND group_id = ? AND month = ?",
		uid, req.GroupType, req.GroupID, req.Month).First(&budget).Error

	if err == nil {
		budget.Budget = req.Budget
		if err := database.DB.Save(&budget).Error; err != nil {
			return nil, fmt.Errorf("更新预算失败: %w", err)
		}
		return &budget, nil
	}

	budget = model.BudgetSetting{
		UserID:    uid,
		GroupType: req.GroupType,
		GroupID:   req.GroupID,
		Month:     req.Month,
		Budget:    req.Budget,
	}
	if err := database.DB.Create(&budget).Error; err != nil {
		return nil, fmt.Errorf("设置预算失败: %w", err)
	}
	return &budget, nil
}

// GetBudget 获取预算
func (s *FeatureService) GetBudget(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID, month string) (*model.BudgetSetting, error) {
	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, err
	}

	var budget model.BudgetSetting
	if err := database.DB.Where("group_type = ? AND group_id = ? AND month = ?", groupType, groupID, month).First(&budget).Error; err != nil {
		return nil, errors.New("未设置预算")
	}
	return &budget, nil
}

// ---- 积分历史 ----

// GetPointHistory 获取积分历史：按当前用户过滤后返回总数和分页后的流水。
func (s *FeatureService) GetPointHistory(ctx context.Context, uid uuid.UUID, page, pageSize int) ([]model.PointRecord, int64, error) {
	var records []model.PointRecord
	var total int64
	page, pageSize = NormalizePagination(page, pageSize)

	query := database.DB.Model(&model.PointRecord{}).Where("user_id = ?", uid)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&records).Error; err != nil {
		return nil, 0, err
	}

	return records, total, nil
}

// ---- 请求结构：扩展功能请求均显式携带 group_type/group_id 以复用组合鉴权 ----

type CreateWishReq struct {
	GroupType string     `json:"group_type" binding:"required,oneof=couple buddy"`
	GroupID   uuid.UUID  `json:"group_id" binding:"required"`
	Name      string     `json:"name" binding:"required,max=100"`
	Note      string     `json:"note"`
	DishID    *uuid.UUID `json:"dish_id"`
}

type BasketReq struct {
	GroupType string    `json:"group_type" binding:"required,oneof=couple buddy"`
	GroupID   uuid.UUID `json:"group_id" binding:"required"`
	Name      string    `json:"name" binding:"required,max=100"`
	Quantity  string    `json:"quantity"`
}

type BudgetReq struct {
	GroupType string    `json:"group_type" binding:"required,oneof=couple buddy"`
	GroupID   uuid.UUID `json:"group_id" binding:"required"`
	Month     string    `json:"month" binding:"required"` // 2026-08
	Budget    float64   `json:"budget" binding:"required,min=0"`
}
