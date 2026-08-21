package handler

import (
	"net/http"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// OrderHandler 负责订单创建、列表、状态确认和投票相关 HTTP 接口。
type OrderHandler struct {
	service *service.OrderService // 订单业务服务
}

// NewOrderHandler 创建订单 handler，处理点餐单、状态流转和饭搭子投票接口。
func NewOrderHandler() *OrderHandler {
	return &OrderHandler{
		service: service.NewOrderService(),
	}
}

// CreateOrder 创建订单：body 包含餐桌、就餐模式和菜品项，金额由 service 汇总。
// POST /api/v1/orders
func (h *OrderHandler) CreateOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	var req service.CreateOrderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	order, err := h.service.CreateOrder(c.Request.Context(), uid, req)
	if err != nil {
		if service.IsOrderRequestError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": order})
}

// GetOrder 获取订单详情：路径 id 指定订单，返回订单及订单项。
// GET /api/v1/orders/:id
func (h *OrderHandler) GetOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	order, err := h.service.GetOrder(c.Request.Context(), uid, orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": order})
}

// ListOrders 获取订单列表：按餐桌与状态过滤，使用 page/page_size 分页。
// GET /api/v1/orders?table_id=example-table-id&status=&page=1&page_size=20
func (h *OrderHandler) ListOrders(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDQuery(c, "table_id")
	if !ok {
		return
	}
	status := c.Query("status")
	page, pageSize := parsePagination(c)

	if tableID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 table_id"})
		return
	}

	orders, total, err := h.service.ListOrders(c.Request.Context(), uid, tableID, status, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": gin.H{
			"list":      orders,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// ConfirmOrder 确认订单：情侣模式中由非创建者确认 pending 订单。
// POST /api/v1/orders/:id/confirm
func (h *OrderHandler) ConfirmOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.ConfirmOrder(c.Request.Context(), uid, orderID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "订单已确认"})
}

// RejectOrder 拒绝订单：情侣模式中由非创建者拒绝 pending 订单。
// POST /api/v1/orders/:id/reject
func (h *OrderHandler) RejectOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.RejectOrder(c.Request.Context(), uid, orderID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "订单已拒绝"})
}

// CancelOrder 取消订单：仅创建者可取消未确认订单。
// POST /api/v1/orders/:id/cancel
func (h *OrderHandler) CancelOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.CancelOrder(c.Request.Context(), uid, orderID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "订单已取消"})
}

// VoteOrder 订单投票：饭搭子共同就餐订单可提交 approve/reject/skip。
// POST /api/v1/orders/:id/vote
func (h *OrderHandler) VoteOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	var req struct {
		Vote string `json:"vote" binding:"required,oneof=approve reject skip"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.VoteOrder(c.Request.Context(), uid, orderID, req.Vote); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "投票成功"})
}

// GetOrderVotes 获取订单投票结果：返回各票型计数及投票明细。
// GET /api/v1/orders/:id/votes
func (h *OrderHandler) GetOrderVotes(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	result, err := h.service.GetOrderVotes(c.Request.Context(), uid, orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}
