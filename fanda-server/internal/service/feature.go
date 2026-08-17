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

// ---- 签到 ----

type CheckinResult struct {
	Points      int    `json:"points"`
	CheckinDate string `json:"checkin_date"`
}

type CheckinStatusResult struct {
	TodayChecked bool  `json:"today_checked"`
	MonthCount   int64 `json:"month_count"`
	Streak       int   `json:"streak"`
}

// Checkin 签到：同一天只允许一次，连续签到在事务中同时写签到、积分和流水。
func (s *FeatureService) Checkin(ctx context.Context, uid uuid.UUID) (*CheckinResult, error) {
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

	return &CheckinResult{
		Points:      points,
		CheckinDate: today,
	}, nil
}

// GetCheckinStatus 获取签到状态：计算今日是否签到、本月次数和从今天/昨天回溯的连续天数。
func (s *FeatureService) GetCheckinStatus(ctx context.Context, uid uuid.UUID) (*CheckinStatusResult, error) {
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

	return &CheckinStatusResult{
		TodayChecked: todayChecked,
		MonthCount:   monthCount,
		Streak:       streak,
	}, nil
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

// ---- 请求结构：扩展功能请求均显式携带 table_id 以复用餐桌鉴权 ----

type CreateWishReq struct {
	TableID uuid.UUID  `json:"table_id" binding:"required"`
	Name    string     `json:"name" binding:"required,max=100"`
	Note    string     `json:"note"`
	DishID  *uuid.UUID `json:"dish_id"`
}

type BasketReq struct {
	TableID  uuid.UUID `json:"table_id" binding:"required"`
	Name     string    `json:"name" binding:"required,max=100"`
	Quantity string    `json:"quantity"`
}

type BudgetReq struct {
	TableID uuid.UUID `json:"table_id" binding:"required"`
	Month   string    `json:"month" binding:"required"` // 2026-08
	Budget  float64   `json:"budget" binding:"required,min=0"`
}
