package handler

import (
	"net/http"
	"strconv"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type FeatureHandler struct {
	service *service.FeatureService
}

func NewFeatureHandler() *FeatureHandler {
	return &FeatureHandler{
		service: service.NewFeatureService(),
	}
}

// ---- 心愿清单 ----

// CreateWish 创建心愿
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

// ListWishes 获取心愿列表
// GET /api/v1/wishes?group_type=couple&group_id=xxx&completed=false
func (h *FeatureHandler) ListWishes(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))

	var completed *bool
	if c.Query("completed") == "true" {
		t := true
		completed = &t
	} else if c.Query("completed") == "false" {
		f := false
		completed = &f
	}

	wishes, err := h.service.ListWishes(c.Request.Context(), groupType, groupID, completed)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": wishes})
}

// CompleteWish 完成心愿
// POST /api/v1/wishes/:id/complete
func (h *FeatureHandler) CompleteWish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	wishID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.CompleteWish(c.Request.Context(), uid, wishID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "心愿已完成"})
}

// DeleteWish 删除心愿
// DELETE /api/v1/wishes/:id
func (h *FeatureHandler) DeleteWish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	wishID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.DeleteWish(c.Request.Context(), uid, wishID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ---- 签到 ----

// Checkin 签到
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

// GetCheckinStatus 获取签到状态
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

// AddToBasket 添加到菜篮子
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

// ListBasket 获取菜篮子
// GET /api/v1/basket?group_type=couple&group_id=xxx
func (h *FeatureHandler) ListBasket(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))

	items, err := h.service.ListBasket(c.Request.Context(), groupType, groupID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": items})
}

// ToggleBasketPurchased 切换购买状态
// POST /api/v1/basket/:id/toggle
func (h *FeatureHandler) ToggleBasketPurchased(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	itemID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.ToggleBasketPurchased(c.Request.Context(), uid, itemID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok"})
}

// DeleteBasket 删除菜篮子项
// DELETE /api/v1/basket/:id
func (h *FeatureHandler) DeleteBasket(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	itemID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.DeleteBasket(c.Request.Context(), uid, itemID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ---- 预算 ----

// SetBudget 设置预算
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

// GetBudget 获取预算
// GET /api/v1/budget?group_type=couple&group_id=xxx&month=2026-08
func (h *FeatureHandler) GetBudget(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))
	month := c.Query("month")

	budget, err := h.service.GetBudget(c.Request.Context(), groupType, groupID, month)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": budget})
}

// ---- 积分 ----

// GetPointHistory 获取积分历史
// GET /api/v1/points?page=1&page_size=20
func (h *FeatureHandler) GetPointHistory(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

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