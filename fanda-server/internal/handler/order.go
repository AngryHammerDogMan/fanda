package handler

import (
	"net/http"
	"strconv"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type OrderHandler struct {
	service *service.OrderService
}

func NewOrderHandler() *OrderHandler {
	return &OrderHandler{
		service: service.NewOrderService(),
	}
}

// CreateOrder 创建订单
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
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": order})
}

// GetOrder 获取订单详情
// GET /api/v1/orders/:id
func (h *OrderHandler) GetOrder(c *gin.Context) {
	orderID, _ := uuid.Parse(c.Param("id"))

	order, err := h.service.GetOrder(c.Request.Context(), orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": order})
}

// ListOrders 获取订单列表
// GET /api/v1/orders?group_type=couple&group_id=xxx&status=&page=1&page_size=20
func (h *OrderHandler) ListOrders(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))
	status := c.Query("status")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if groupType == "" || groupID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 group_type 或 group_id"})
		return
	}

	orders, total, err := h.service.ListOrders(c.Request.Context(), groupType, groupID, status, page, pageSize)
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

// ConfirmOrder 确认订单
// POST /api/v1/orders/:id/confirm
func (h *OrderHandler) ConfirmOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.ConfirmOrder(c.Request.Context(), uid, orderID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "订单已确认"})
}

// RejectOrder 拒绝订单
// POST /api/v1/orders/:id/reject
func (h *OrderHandler) RejectOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.RejectOrder(c.Request.Context(), uid, orderID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "订单已拒绝"})
}

// CancelOrder 取消订单
// POST /api/v1/orders/:id/cancel
func (h *OrderHandler) CancelOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.CancelOrder(c.Request.Context(), uid, orderID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "订单已取消"})
}

// VoteOrder 订单投票
// POST /api/v1/orders/:id/vote
func (h *OrderHandler) VoteOrder(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	orderID, _ := uuid.Parse(c.Param("id"))

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

// GetOrderVotes 获取订单投票结果
// GET /api/v1/orders/:id/votes
func (h *OrderHandler) GetOrderVotes(c *gin.Context) {
	orderID, _ := uuid.Parse(c.Param("id"))

	result, err := h.service.GetOrderVotes(c.Request.Context(), orderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}