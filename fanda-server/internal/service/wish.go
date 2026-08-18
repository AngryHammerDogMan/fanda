package service

import (
	"context"
	"errors"
	"fmt"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

// WishService 管理餐桌心愿清单，创建、完成和删除均围绕创建者身份控制。
type WishService struct{}

// NewWishService 创建心愿服务实例。
func NewWishService() *WishService {
	return &WishService{}
}

// CreateWish 创建心愿：先确认当前用户可访问目标餐桌，再写入个人创建的心愿。
func (s *WishService) CreateWish(ctx context.Context, uid uuid.UUID, req CreateWishReq) (*model.WishItem, error) {
	if err := CanAccessTable(ctx, uid, req.TableID); err != nil {
		return nil, err
	}

	wish := model.WishItem{
		UserID:  uid,
		TableID: req.TableID,
		Name:    req.Name,
		Note:    req.Note,
	}
	if req.DishID != nil {
		wish.DishID = req.DishID
	}
	if err := database.DB.Create(&wish).Error; err != nil {
		return nil, fmt.Errorf("创建心愿失败: %w", err)
	}
	return &wish, nil
}

// ListWishes 获取心愿列表：餐桌鉴权后可按完成状态过滤。
func (s *WishService) ListWishes(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, completed *bool) ([]model.WishItem, error) {
	var wishes []model.WishItem
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}
	query := database.DB.Where("table_id = ?", tableID)
	if completed != nil {
		query = query.Where("is_completed = ?", *completed)
	}
	if err := query.Order("created_at DESC").Find(&wishes).Error; err != nil {
		return nil, err
	}
	return wishes, nil
}

// CompleteWish 完成心愿：按 user_id 限制为创建者操作，避免组内成员互相修改。
func (s *WishService) CompleteWish(ctx context.Context, uid uuid.UUID, wishID uuid.UUID) error {
	result := database.DB.Model(&model.WishItem{}).
		Where("id = ? AND user_id = ?", wishID, uid).
		Update("is_completed", true)
	if result.RowsAffected == 0 {
		return errors.New("心愿不存在")
	}
	return result.Error
}

// DeleteWish 删除心愿：按 user_id 限制为创建者删除。
func (s *WishService) DeleteWish(ctx context.Context, uid uuid.UUID, wishID uuid.UUID) error {
	result := database.DB.Where("id = ? AND user_id = ?", wishID, uid).Delete(&model.WishItem{})
	if result.RowsAffected == 0 {
		return errors.New("心愿不存在")
	}
	return result.Error
}
