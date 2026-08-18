package service

import (
	"context"
	"errors"
	"fmt"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

// BudgetService 管理用户在指定餐桌、指定月份下的个人预算。
type BudgetService struct{}

// NewBudgetService 创建预算服务实例。
func NewBudgetService() *BudgetService {
	return &BudgetService{}
}

// SetBudget 设置预算：同一用户、餐桌和月份已有记录时更新，否则创建新预算。
func (s *BudgetService) SetBudget(ctx context.Context, uid uuid.UUID, req BudgetReq) (*model.BudgetSetting, error) {
	if err := CanAccessTable(ctx, uid, req.TableID); err != nil {
		return nil, err
	}

	var budget model.BudgetSetting
	// 查找已有设置，存在则更新
	err := database.DB.Where("user_id = ? AND table_id = ? AND month = ?",
		uid, req.TableID, req.Month).First(&budget).Error

	if err == nil {
		budget.Budget = req.Budget
		if err := database.DB.Save(&budget).Error; err != nil {
			return nil, fmt.Errorf("更新预算失败: %w", err)
		}
		return &budget, nil
	}

	budget = model.BudgetSetting{
		UserID:  uid,
		TableID: req.TableID,
		Month:   req.Month,
		Budget:  req.Budget,
	}
	if err := database.DB.Create(&budget).Error; err != nil {
		return nil, fmt.Errorf("设置预算失败: %w", err)
	}
	return &budget, nil
}

// GetBudget 获取预算：先校验餐桌权限，再读取当前用户自己的月度预算。
func (s *BudgetService) GetBudget(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, month string) (*model.BudgetSetting, error) {
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}

	var budget model.BudgetSetting
	if err := database.DB.Where("user_id = ? AND table_id = ? AND month = ?", uid, tableID, month).First(&budget).Error; err != nil {
		return nil, errors.New("未设置预算")
	}
	return &budget, nil
}
