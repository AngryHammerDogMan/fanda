package service

import (
	"context"
	"errors"
	"fmt"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

type BasketService struct{}

func NewBasketService() *BasketService {
	return &BasketService{}
}

// AddToBasket 添加到菜篮子：数量缺省时写入 "1"，其余字段保持用户输入。
func (s *BasketService) AddToBasket(ctx context.Context, uid uuid.UUID, req BasketReq) (*model.ShoppingBasket, error) {
	if err := CanAccessTable(ctx, uid, req.TableID); err != nil {
		return nil, err
	}

	item := model.ShoppingBasket{
		UserID:   uid,
		TableID:  req.TableID,
		Name:     req.Name,
		Quantity: req.Quantity,
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
func (s *BasketService) ListBasket(ctx context.Context, uid uuid.UUID, tableID uuid.UUID) ([]model.ShoppingBasket, error) {
	var items []model.ShoppingBasket
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}
	if err := database.DB.Where("table_id = ?", tableID).
		Order("is_purchased ASC, created_at DESC").Find(&items).Error; err != nil {
		return nil, err
	}
	return items, nil
}

// ToggleBasketPurchased 切换购买状态
func (s *BasketService) ToggleBasketPurchased(ctx context.Context, uid uuid.UUID, itemID uuid.UUID) error {
	var item model.ShoppingBasket
	if err := database.DB.Where("id = ? AND user_id = ?", itemID, uid).First(&item).Error; err != nil {
		return errors.New("物品不存在")
	}
	return database.DB.Model(&item).Update("is_purchased", !item.IsPurchased).Error
}

// DeleteBasket 删除菜篮子项
func (s *BasketService) DeleteBasket(ctx context.Context, uid uuid.UUID, itemID uuid.UUID) error {
	result := database.DB.Where("id = ? AND user_id = ?", itemID, uid).Delete(&model.ShoppingBasket{})
	if result.RowsAffected == 0 {
		return errors.New("物品不存在")
	}
	return result.Error
}
