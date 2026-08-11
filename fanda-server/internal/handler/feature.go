package handler

import (
	"net/http"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type FeatureHandler struct {
	service *service.FeatureService
}

// NewFeatureHandler 创建扩展功能 handler，覆盖心愿、签到、菜篮子、预算和积分。
func NewFeatureHandler() *FeatureHandler {
	return &FeatureHandler{
		service: service.NewFeatureService(),
	}
}

// ---- 心愿清单 ----

// CreateWish 创建心愿：body 指定餐桌、心愿名称和可选关联菜品。
// POST /api/v1/wishes
func (h *FeatureHandler) CreateWish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	var req service.CreateWishReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	wish, err := h.service.CreateWish(c.Request.Context(), uid, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": wish})
}

// ListWishes 获取心愿列表：completed 支持 true/false 过滤，缺省返回全部。
// GET /api/v1/wishes?table_id=example-table-id&completed=false
func (h *FeatureHandler) ListWishes(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDQuery(c, "table_id")
	if !ok {
		return
	}

	var completed *bool
	if c.Query("completed") == "true" {
		t := true
		completed = &t
	} else if c.Query("completed") == "false" {
		f := false
		completed = &f
	}

	wishes, err := h.service.ListWishes(c.Request.Context(), uid, tableID, completed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": wishes})
}

// CompleteWish 完成心愿：路径 id 指定心愿，仅创建者可标记完成。
// POST /api/v1/wishes/:id/complete
func (h *FeatureHandler) CompleteWish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	wishID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.CompleteWish(c.Request.Context(), uid, wishID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "心愿已完成"})
}

// DeleteWish 删除心愿：路径 id 指定心愿，仅创建者可删除。
// DELETE /api/v1/wishes/:id
func (h *FeatureHandler) DeleteWish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	wishID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteWish(c.Request.Context(), uid, wishID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ---- 签到 ----

// Checkin 签到：不需要 body，根据当前日期创建签到并发放积分。
// POST /api/v1/checkin
func (h *FeatureHandler) Checkin(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	result, err := h.service.Checkin(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "签到成功", "data": result})
}

// GetCheckinStatus 获取签到状态：返回今日、本月和连续签到信息。
// GET /api/v1/checkin/status
func (h *FeatureHandler) GetCheckinStatus(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	result, err := h.service.GetCheckinStatus(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}

// ---- 菜篮子 ----

// AddToBasket 添加到菜篮子：body 指定餐桌、物品名称和可选数量。
// POST /api/v1/basket
func (h *FeatureHandler) AddToBasket(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	var req service.BasketReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	item, err := h.service.AddToBasket(c.Request.Context(), uid, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": item})
}

// ListBasket 获取菜篮子：按餐桌返回未购买优先、最新在前的清单。
// GET /api/v1/basket?table_id=example-table-id
func (h *FeatureHandler) ListBasket(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDQuery(c, "table_id")
	if !ok {
		return
	}

	items, err := h.service.ListBasket(c.Request.Context(), uid, tableID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": items})
}

// ToggleBasketPurchased 切换购买状态：路径 id 指定清单项，仅创建者可操作。
// POST /api/v1/basket/:id/toggle
func (h *FeatureHandler) ToggleBasketPurchased(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	itemID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.ToggleBasketPurchased(c.Request.Context(), uid, itemID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok"})
}

// DeleteBasket 删除菜篮子项：路径 id 指定清单项，仅创建者可删除。
// DELETE /api/v1/basket/:id
func (h *FeatureHandler) DeleteBasket(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	itemID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteBasket(c.Request.Context(), uid, itemID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ---- 预算 ----

// SetBudget 设置预算：body.month 为 YYYY-MM，存在则覆盖当月预算。
// POST /api/v1/budget
func (h *FeatureHandler) SetBudget(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	var req service.BudgetReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	budget, err := h.service.SetBudget(c.Request.Context(), uid, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": budget})
}

// GetBudget 获取预算：按餐桌和月份查询预算设置，不存在返回 404。
// GET /api/v1/budget?table_id=example-table-id&month=2026-08
func (h *FeatureHandler) GetBudget(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDQuery(c, "table_id")
	if !ok {
		return
	}
	month := c.Query("month")

	budget, err := h.service.GetBudget(c.Request.Context(), uid, tableID, month)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": budget})
}

// ---- 积分 ----

// GetPointHistory 获取积分历史：返回当前用户积分流水和分页元信息。
// GET /api/v1/points?page=1&page_size=20
func (h *FeatureHandler) GetPointHistory(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	page, pageSize := parsePagination(c)

	records, total, err := h.service.GetPointHistory(c.Request.Context(), uid, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": gin.H{
			"list":      records,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}
