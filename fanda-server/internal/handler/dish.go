package handler

import (
	"net/http"
	"strconv"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DishHandler struct {
	service *service.DishService
}

func NewDishHandler() *DishHandler {
	return &DishHandler{
		service: service.NewDishService(),
	}
}

// CreateDish 创建菜品
// POST /api/v1/dishes
func (h *DishHandler) CreateDish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	var req service.CreateDishReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	dish, err := h.service.CreateDish(c.Request.Context(), uid, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": dish})
}

// UpdateDish 更新菜品
// PUT /api/v1/dishes/:id
func (h *DishHandler) UpdateDish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	dishID, _ := uuid.Parse(c.Param("id"))

	var req service.UpdateDishReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.UpdateDish(c.Request.Context(), uid, dishID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// DeleteDish 删除菜品
// DELETE /api/v1/dishes/:id
func (h *DishHandler) DeleteDish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	dishID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.DeleteDish(c.Request.Context(), uid, dishID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// GetDish 获取菜品详情
// GET /api/v1/dishes/:id
func (h *DishHandler) GetDish(c *gin.Context) {
	dishID, _ := uuid.Parse(c.Param("id"))

	dish, err := h.service.GetDish(c.Request.Context(), dishID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": dish})
}

// ListDishes 获取菜品列表
// GET /api/v1/dishes?group_type=couple&group_id=xxx&dish_type=&category=&keyword=&page=1&page_size=20
func (h *DishHandler) ListDishes(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))
	dishType := c.Query("dish_type")
	category := c.Query("category")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if groupType == "" || groupID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 group_type 或 group_id"})
		return
	}

	dishes, total, err := h.service.ListDishes(c.Request.Context(), groupType, groupID, dishType, category, keyword, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": gin.H{
			"list":      dishes,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// ImportFromPlaza 从学菜广场导入菜品
// POST /api/v1/dishes/import
func (h *DishHandler) ImportFromPlaza(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	var req struct {
		PlazaID   string `json:"plaza_id" binding:"required"`
		GroupType string `json:"group_type" binding:"required,oneof=couple buddy"`
		GroupID   string `json:"group_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	plazaID, _ := uuid.Parse(req.PlazaID)
	groupID, _ := uuid.Parse(req.GroupID)

	dish, err := h.service.ImportFromPlaza(c.Request.Context(), uid, plazaID, req.GroupType, groupID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "导入成功", "data": dish})
}

// SearchPlaza 搜索学菜广场
// GET /api/v1/plaza?category=&keyword=&page=1&page_size=20
func (h *DishHandler) SearchPlaza(c *gin.Context) {
	category := c.Query("category")
	keyword := c.Query("keyword")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	dishes, total, err := h.service.SearchPlaza(c.Request.Context(), category, keyword, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data": gin.H{
			"list":      dishes,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// GetPlazaCategories 获取学菜广场分类
// GET /api/v1/plaza/categories
func (h *DishHandler) GetPlazaCategories(c *gin.Context) {
	categories, _ := h.service.GetPlazaCategories(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": categories})
}