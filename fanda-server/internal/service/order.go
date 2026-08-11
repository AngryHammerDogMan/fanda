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

type OrderService struct{}

// NewOrderService 创建订单服务，负责订单创建、状态流转和投票聚合。
func NewOrderService() *OrderService {
	return &OrderService{}
}

// CreateOrder 创建订单：先做餐桌鉴权，再用事务同时创建订单、订单项、日历记录和可选参与人。
func (s *OrderService) CreateOrder(ctx context.Context, uid uuid.UUID, req CreateOrderReq) (*model.Order, error) {
	if err := CanAccessTable(ctx, uid, req.TableID); err != nil {
		return nil, err
	}

	status := "confirmed"
	recordStatus := "confirmed"
	if req.DineMode == "together" && len(req.ParticipantIDs) > 0 {
		status = "pending"
		recordStatus = "pending"
	}
	if req.DineMode == "together" {
		for _, participantID := range req.ParticipantIDs {
			if participantID == uid {
				return nil, errors.New("不能邀请自己")
			}
			if err := CanAccessTable(ctx, participantID, req.TableID); err != nil {
				return nil, errors.New("参与人不属于该餐桌")
			}
		}
	}

	order := model.Order{
		ID:        uuid.New(),
		CreatorID: uid,
		TableID:   req.TableID,
		DineMode:  req.DineMode,
		Status:    status,
	}

	tx := database.DB.WithContext(ctx).Begin()

	if err := tx.Create(&order).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建订单失败: %w", err)
	}

	var totalAmount float64
	dishIDs := make([]string, 0, len(req.Items))
	for _, item := range req.Items {
		orderItem := model.OrderItem{
			ID:       uuid.New(),
			OrderID:  order.ID,
			DishID:   item.DishID,
			Quantity: item.Quantity,
		}
		dishIDs = append(dishIDs, item.DishID.String())
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
	}

	record := model.CalendarRecord{
		ID:         uuid.New(),
		UserID:     uid,
		TableID:    req.TableID,
		RecordDate: time.Now(),
		MealType:   "cook",
		MealPeriod: "",
		DishIDs:    dishIDs,
		Amount:     order.TotalAmount,
		Source:     "order",
		Status:     recordStatus,
	}
	if err := tx.Create(&record).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建日历记录失败: %w", err)
	}

	order.CalendarRecordID = &record.ID
	if err := tx.Model(&order).Updates(model.Order{TotalAmount: order.TotalAmount, CalendarRecordID: order.CalendarRecordID}).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("更新订单汇总失败: %w", err)
	}

	if req.DineMode == "together" {
		for _, participantID := range req.ParticipantIDs {
			participant := model.OrderParticipant{
				ID:      uuid.New(),
				OrderID: order.ID,
				UserID:  participantID,
				Status:  "invited",
			}
			if err := tx.Create(&participant).Error; err != nil {
				tx.Rollback()
				return nil, fmt.Errorf("添加参与人失败: %w", err)
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	// 重新加载带关联数据
	database.DB.WithContext(ctx).Preload("OrderItems").Preload("Participants").First(&order, "id = ?", order.ID)
	return &order, nil
}

// GetOrder 获取订单详情
func (s *OrderService) GetOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) (*model.Order, error) {
	if _, err := CanAccessOrder(ctx, uid, orderID); err != nil {
		return nil, errors.New("订单不存在")
	}
	var order model.Order
	if err := database.DB.WithContext(ctx).Preload("OrderItems").Preload("Participants").First(&order, "id = ?", orderID).Error; err != nil {
		return nil, errors.New("订单不存在")
	}
	return &order, nil
}

// ListOrders 获取订单列表：餐桌鉴权后按状态过滤，Count 和分页查询使用同一组条件。
func (s *OrderService) ListOrders(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, status string, page, pageSize int) ([]model.Order, int64, error) {
	var orders []model.Order
	var total int64
	page, pageSize = NormalizePagination(page, pageSize)

	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, 0, err
	}

	query := database.DB.Model(&model.Order{}).
		Where("table_id = ?", tableID)

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Preload("OrderItems").Preload("Participants").Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&orders).Error; err != nil {
		return nil, 0, err
	}

	return orders, total, nil
}

// ConfirmOrder 确认订单：pending 状态下仅非创建者可确认，防止自提自批。
func (s *OrderService) ConfirmOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) error {
	order, err := CanAccessOrder(ctx, uid, orderID)
	if err != nil {
		return errors.New("订单不存在")
	}

	if order.Status != "pending" {
		return errors.New("订单状态不允许确认")
	}

	// 验证是否是对方
	if order.CreatorID == uid {
		return errors.New("不能确认自己的订单")
	}

	return database.DB.Model(order).Update("status", "confirmed").Error
}

// RejectOrder 拒绝订单
func (s *OrderService) RejectOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) error {
	order, err := CanAccessOrder(ctx, uid, orderID)
	if err != nil {
		return errors.New("订单不存在")
	}

	if order.Status != "pending" {
		return errors.New("订单状态不允许拒绝")
	}

	if order.CreatorID == uid {
		return errors.New("不能拒绝自己的订单")
	}

	return database.DB.Model(order).Update("status", "rejected").Error
}

// CancelOrder 取消订单
func (s *OrderService) CancelOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) error {
	order, err := CanAccessOrder(ctx, uid, orderID)
	if err != nil {
		return errors.New("订单不存在")
	}

	if order.CreatorID != uid {
		return errors.New("只能取消自己创建的订单")
	}

	if order.Status == "confirmed" {
		return errors.New("已确认的订单不能取消")
	}

	return database.DB.Model(order).Update("status", "cancelled").Error
}

// VoteOrder 投票：饭搭子 voted 状态订单可投票；重复投不同票会更新原投票。
func (s *OrderService) VoteOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID, vote string) error {
	order, err := CanAccessOrder(ctx, uid, orderID)
	if err != nil {
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

type OrderVotesResult struct {
	Approve int               `json:"approve"`
	Reject  int               `json:"reject"`
	Skip    int               `json:"skip"`
	Total   int               `json:"total"`
	Votes   []model.OrderVote `json:"votes"`
}

// GetOrderVotes 获取订单投票结果：读取投票明细后在内存中聚合 approve/reject/skip。
func (s *OrderService) GetOrderVotes(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) (*OrderVotesResult, error) {
	if _, err := CanAccessOrder(ctx, uid, orderID); err != nil {
		return nil, errors.New("订单不存在")
	}

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

	return &OrderVotesResult{
		Approve: approve,
		Reject:  reject,
		Skip:    skip,
		Total:   len(votes),
		Votes:   votes,
	}, nil
}

// ---- 请求结构：订单创建请求由餐桌、就餐模式和至少一个订单项组成 ----

type CreateOrderReq struct {
	TableID        uuid.UUID      `json:"table_id" binding:"required"`
	DineMode       string         `json:"dine_mode" binding:"required,oneof=together solo"`
	ParticipantIDs []uuid.UUID    `json:"participant_ids"`
	Items          []OrderItemReq `json:"items" binding:"required,min=1"`
}

type OrderItemReq struct {
	DishID    uuid.UUID `json:"dish_id" binding:"required"`
	Quantity  int       `json:"quantity" binding:"required,min=1"`
	UnitPrice *float64  `json:"unit_price"`
}
