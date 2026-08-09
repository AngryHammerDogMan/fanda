package service

import (
	"context"
	"errors"
	"fmt"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

type OrderService struct{}

func NewOrderService() *OrderService {
	return &OrderService{}
}

// CreateOrder 创建订单
func (s *OrderService) CreateOrder(ctx context.Context, uid uuid.UUID, req CreateOrderReq) (*model.Order, error) {
	order := model.Order{
		CreatorID: uid,
		GroupType: req.GroupType,
		GroupID:   req.GroupID,
		DineMode:  req.DineMode,
		Status:    "pending",
	}

	// 饭搭子+共同就餐 → 进入投票模式
	if req.GroupType == "buddy" && req.DineMode == "together" {
		order.Status = "voted"
	}

	tx := database.DB.Begin()

	if err := tx.Create(&order).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建订单失败: %w", err)
	}

	var totalAmount float64
	for _, item := range req.Items {
		orderItem := model.OrderItem{
			OrderID:  order.ID,
			DishID:   item.DishID,
			Quantity: item.Quantity,
		}
		if item.UnitPrice != nil {
			orderItem.UnitPrice = item.UnitPrice
			totalAmount += *item.UnitPrice * float64(item.Quantity)
		}
		if err := tx.Create(&orderItem).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("添加订单项失败: %w", err)
		}
	}

	if totalAmount > 0 {
		order.TotalAmount = &totalAmount
		tx.Model(&order).Update("total_amount", totalAmount)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	// 重新加载带关联数据
	database.DB.Preload("OrderItems").First(&order, "id = ?", order.ID)
	return &order, nil
}

// GetOrder 获取订单详情
func (s *OrderService) GetOrder(ctx context.Context, orderID uuid.UUID) (*model.Order, error) {
	var order model.Order
	if err := database.DB.Preload("OrderItems").First(&order, "id = ?", orderID).Error; err != nil {
		return nil, errors.New("订单不存在")
	}
	return &order, nil
}

// ListOrders 获取订单列表
func (s *OrderService) ListOrders(ctx context.Context, groupType string, groupID uuid.UUID, status string, page, pageSize int) ([]model.Order, int64, error) {
	var orders []model.Order
	var total int64

	query := database.DB.Model(&model.Order{}).
		Where("group_type = ? AND group_id = ?", groupType, groupID)

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Preload("OrderItems").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&orders).Error; err != nil {
		return nil, 0, err
	}

	return orders, total, nil
}

// ConfirmOrder 确认订单（情侣模式：对方确认；饭搭子：无需确认，直接同意）
func (s *OrderService) ConfirmOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) error {
	var order model.Order
	if err := database.DB.First(&order, "id = ?", orderID).Error; err != nil {
		return errors.New("订单不存在")
	}

	if order.Status != "pending" {
		return errors.New("订单状态不允许确认")
	}

	// 验证是否是对方
	if order.CreatorID == uid {
		return errors.New("不能确认自己的订单")
	}

	return database.DB.Model(&order).Update("status", "confirmed").Error
}

// RejectOrder 拒绝订单
func (s *OrderService) RejectOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) error {
	var order model.Order
	if err := database.DB.First(&order, "id = ?", orderID).Error; err != nil {
		return errors.New("订单不存在")
	}

	if order.Status != "pending" {
		return errors.New("订单状态不允许拒绝")
	}

	if order.CreatorID == uid {
		return errors.New("不能拒绝自己的订单")
	}

	return database.DB.Model(&order).Update("status", "rejected").Error
}

// CancelOrder 取消订单
func (s *OrderService) CancelOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) error {
	var order model.Order
	if err := database.DB.First(&order, "id = ?", orderID).Error; err != nil {
		return errors.New("订单不存在")
	}

	if order.CreatorID != uid {
		return errors.New("只能取消自己创建的订单")
	}

	if order.Status == "confirmed" {
		return errors.New("已确认的订单不能取消")
	}

	return database.DB.Model(&order).Update("status", "cancelled").Error
}

// VoteOrder 投票（饭搭子模式）
func (s *OrderService) VoteOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID, vote string) error {
	var order model.Order
	if err := database.DB.First(&order, "id = ?", orderID).Error; err != nil {
		return errors.New("订单不存在")
	}

	if order.Status != "voted" {
		return errors.New("订单不在投票状态")
	}

	// 检查是否已投票
	var existing model.OrderVote
	if err := database.DB.Where("order_id = ? AND user_id = ?", orderID, uid).First(&existing).Error; err == nil {
		if existing.Vote == vote {
			return errors.New("已投过相同的票")
		}
		database.DB.Model(&existing).Update("vote", vote)
		return nil
	}

	ov := model.OrderVote{
		OrderID: orderID,
		UserID:  uid,
		Vote:    vote,
	}
	if err := database.DB.Create(&ov).Error; err != nil {
		return fmt.Errorf("投票失败: %w", err)
	}

	return nil
}

// GetOrderVotes 获取订单投票结果
func (s *OrderService) GetOrderVotes(ctx context.Context, orderID uuid.UUID) (map[string]interface{}, error) {
	var votes []model.OrderVote
	database.DB.Where("order_id = ?", orderID).Find(&votes)

	var approve, reject, skip int
	for _, v := range votes {
		switch v.Vote {
		case "approve":
			approve++
		case "reject":
			reject++
		case "skip":
			skip++
		}
	}

	return map[string]interface{}{
		"approve": approve,
		"reject":  reject,
		"skip":    skip,
		"total":   len(votes),
		"votes":   votes,
	}, nil
}

// ---- 请求结构 ----

type CreateOrderReq struct {
	GroupType string        `json:"group_type" binding:"required,oneof=couple buddy"`
	GroupID   uuid.UUID     `json:"group_id" binding:"required"`
	DineMode  string        `json:"dine_mode" binding:"required,oneof=together solo"`
	Items     []OrderItemReq `json:"items" binding:"required,min=1"`
}

type OrderItemReq struct {
	DishID    uuid.UUID `json:"dish_id" binding:"required"`
	Quantity  int       `json:"quantity" binding:"required,min=1"`
	UnitPrice *float64  `json:"unit_price"`
}