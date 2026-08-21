package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// OrderService 管理点单、一起吃确认、取消和饭搭子投票流程。
type OrderService struct{}

type orderRequestError struct {
	err error
}

func (e *orderRequestError) Error() string { return e.err.Error() }
func (e *orderRequestError) Unwrap() error { return e.err }

func newOrderRequestError(err error) error {
	return &orderRequestError{err: err}
}

// IsOrderRequestError 判断创建订单失败是否由请求内容或业务校验导致。
func IsOrderRequestError(err error) bool {
	var requestErr *orderRequestError
	return errors.As(err, &requestErr)
}

func handleOrderAuthorizationError(err error, notFoundMessage string) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return newOrderRequestError(errors.New(notFoundMessage))
	}
	return err
}

// NewOrderService 创建订单服务，负责订单创建、状态流转和投票聚合。
func NewOrderService() *OrderService {
	return &OrderService{}
}

// CreateOrder 创建订单：先做餐桌鉴权，再用事务同时创建订单、订单项、日历记录和可选参与人。
func (s *OrderService) CreateOrder(ctx context.Context, uid uuid.UUID, req CreateOrderReq) (*model.Order, error) {
	if err := CanAccessTable(ctx, uid, req.TableID); err != nil {
		return nil, handleOrderAuthorizationError(err, "无权访问该餐桌")
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
				return nil, newOrderRequestError(errors.New("不能邀请自己"))
			}
			if err := CanAccessTable(ctx, participantID, req.TableID); err != nil {
				return nil, handleOrderAuthorizationError(err, "参与人不属于该餐桌")
			}
		}
	}
	for _, basketItem := range req.BasketItems {
		if basketItem.Name == "" {
			return nil, newOrderRequestError(errors.New("采购项名称不能为空"))
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
	dishes, err := loadOrderDishes(ctx, tx, req.TableID, req.Items)
	if err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Create(&order).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建订单失败: %w", err)
	}

	confirmedAmounts := make([]*float64, 0, len(req.Items))
	dishIDs := make([]string, 0, len(req.Items))
	for _, item := range req.Items {
		confirmedAmount, err := normalizeAmount(item.ConfirmedAmount)
		if err != nil {
			tx.Rollback()
			return nil, newOrderRequestError(fmt.Errorf("确认金额无效: %w", err))
		}
		dish := dishes[item.DishID]
		orderItem := model.OrderItem{
			ID:              uuid.New(),
			OrderID:         order.ID,
			DishID:          item.DishID,
			Quantity:        item.Quantity,
			UnitPrice:       dish.Price,
			ConfirmedAmount: confirmedAmount,
		}
		dishIDs = append(dishIDs, item.DishID.String())
		confirmedAmounts = append(confirmedAmounts, confirmedAmount)
		if err := tx.Create(&orderItem).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("添加订单项失败: %w", err)
		}
	}

	order.TotalAmount = sumAmounts(confirmedAmounts)
	if err := validateAmountTotal(order.TotalAmount); err != nil {
		tx.Rollback()
		return nil, newOrderRequestError(fmt.Errorf("订单总金额无效: %w", err))
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
	for _, basketItem := range req.BasketItems {
		quantity := basketItem.Quantity
		if quantity == "" {
			quantity = "1"
		}
		item := model.ShoppingBasket{
			ID:          uuid.New(),
			UserID:      uid,
			TableID:     req.TableID,
			Name:        basketItem.Name,
			Quantity:    quantity,
			IsPurchased: false,
		}
		if err := tx.Create(&item).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("添加采购项失败: %w", err)
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

	return s.updateOrderState(ctx, order, "confirmed", uid)
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

	return s.updateOrderState(ctx, order, "rejected", uid)
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

	return s.updateOrderState(ctx, order, "cancelled", uid)
}

// loadOrderDishes 批量读取订单菜品，并确认其都属于当前餐桌且未被软删除。
func loadOrderDishes(ctx context.Context, tx *gorm.DB, tableID uuid.UUID, items []OrderItemReq) (map[uuid.UUID]model.Dish, error) {
	if len(items) == 0 {
		return nil, newOrderRequestError(errors.New("订单至少包含一个菜品"))
	}

	seen := make(map[uuid.UUID]struct{}, len(items))
	dishIDs := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		if _, ok := seen[item.DishID]; ok {
			continue
		}
		seen[item.DishID] = struct{}{}
		dishIDs = append(dishIDs, item.DishID)
	}

	var dishes []model.Dish
	if err := tx.WithContext(ctx).
		Where("id IN ? AND table_id = ? AND is_deleted = ?", dishIDs, tableID, false).
		Find(&dishes).Error; err != nil {
		return nil, fmt.Errorf("校验菜品失败: %w", err)
	}
	if len(dishes) != len(dishIDs) {
		return nil, newOrderRequestError(errors.New("订单包含不存在或无权访问的菜品"))
	}
	result := make(map[uuid.UUID]model.Dish, len(dishes))
	for _, dish := range dishes {
		result[dish.ID] = dish
	}
	return result, nil
}

// updateOrderState 同步订单状态、关联日历记录状态和当前参与人的确认状态。
func (s *OrderService) updateOrderState(ctx context.Context, order *model.Order, nextStatus string, actorID uuid.UUID) error {
	return database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Order{}).Where("id = ?", order.ID).Update("status", nextStatus).Error; err != nil {
			return err
		}

		if order.CalendarRecordID != nil {
			recordStatus := mapOrderStatusToRecordStatus(nextStatus)
			if err := tx.Model(&model.CalendarRecord{}).Where("id = ?", *order.CalendarRecordID).Update("status", recordStatus).Error; err != nil {
				return err
			}
		}

		return updateParticipantForOrderState(tx, order.ID, actorID, nextStatus)
	})
}

// mapOrderStatusToRecordStatus 将订单状态映射为日历记录状态，拒绝视为取消。
func mapOrderStatusToRecordStatus(orderStatus string) string {
	switch orderStatus {
	case "confirmed", "cancelled":
		return orderStatus
	case "rejected":
		return "cancelled"
	default:
		return "pending"
	}
}

// updateParticipantForOrderState 根据订单流转结果更新参与人状态。
func updateParticipantForOrderState(tx *gorm.DB, orderID, actorID uuid.UUID, nextStatus string) error {
	switch nextStatus {
	case "confirmed":
		result := tx.Model(&model.OrderParticipant{}).
			Where("order_id = ? AND user_id = ?", orderID, actorID).
			Update("status", "accepted")
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("订单参与人不存在")
		}
	case "rejected":
		result := tx.Model(&model.OrderParticipant{}).
			Where("order_id = ? AND user_id = ?", orderID, actorID).
			Update("status", "rejected")
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return errors.New("订单参与人不存在")
		}
	case "cancelled":
		if err := tx.Model(&model.OrderParticipant{}).
			Where("order_id = ?", orderID).
			Update("status", "skipped").Error; err != nil {
			return err
		}
	}
	return nil
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

// OrderVotesResult 是订单投票聚合结果，包含各票数和原始投票列表。
type OrderVotesResult struct {
	Approve int               `json:"approve"` // 赞成票数
	Reject  int               `json:"reject"`  // 反对票数
	Skip    int               `json:"skip"`    // 跳过票数
	Total   int               `json:"total"`   // 总投票数
	Votes   []model.OrderVote `json:"votes"`   // 投票明细
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

// CreateOrderReq 是创建订单请求体，Items 至少包含一个菜品。
type CreateOrderReq struct {
	TableID        uuid.UUID            `json:"table_id" binding:"required"`                      // 目标餐桌 ID
	DineMode       string               `json:"dine_mode" binding:"required,oneof=together solo"` // 就餐模式
	ParticipantIDs []uuid.UUID          `json:"participant_ids"`                                  // 一起吃参与人
	Items          []OrderItemReq       `json:"items" binding:"required,min=1"`                   // 订单菜品
	BasketItems    []OrderBasketItemReq `json:"basket_items"`                                     // 顺手加入菜篮子的采购项
}

// OrderItemReq 描述订单中的一个菜品条目。
type OrderItemReq struct {
	DishID          uuid.UUID `json:"dish_id" binding:"required"`        // 菜品 ID
	Quantity        int       `json:"quantity" binding:"required,min=1"` // 数量
	ConfirmedAmount *float64  `json:"confirmed_amount"`                  // 本订单项合计确认金额
}

// OrderBasketItemReq 描述创建订单时同步加入菜篮子的采购项。
type OrderBasketItemReq struct {
	Name     string `json:"name" binding:"required,max=100"` // 采购项名称
	Quantity string `json:"quantity"`                        // 采购数量，空值默认 1
}
