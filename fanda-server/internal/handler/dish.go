package handler

import (
	"net/http"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DishHandler struct {
	service *service.DishService
}

// NewDishHandler 创建菜品 handler，负责个人菜品库和学菜广场相关请求。
func NewDishHandler() *DishHandler {
	return &DishHandler{
		service: service.NewDishService(),
	}
}

// CreateDish 创建菜品：body 描述菜品、归属 group 和类型，uid 作为创建人写入。
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

// UpdateDish 更新菜品：路径 id 指定菜品，仅创建者可修改可变字段。
// PUT /api/v1/dishes/:id
func (h *DishHandler) UpdateDish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	dishID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

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

// DeleteDish 删除菜品：路径 id 指定菜品，service 执行软删除以保留历史引用。
// DELETE /api/v1/dishes/:id
func (h *DishHandler) DeleteDish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	dishID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteDish(c.Request.Context(), uid, dishID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// GetDish 获取菜品详情：返回前先确认当前用户仍可访问菜品所属组合。
// GET /api/v1/dishes/:id
func (h *DishHandler) GetDish(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	dishID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	dish, err := h.service.GetDish(c.Request.Context(), uid, dishID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": dish})
}

// ListDishes 获取菜品列表：按组合、菜品类型、分类、关键词过滤，并返回分页元信息。
// GET /api/v1/dishes?group_type=couple&group_id=example-group-id&dish_type=&category=&keyword=&page=1&page_size=20
func (h *DishHandler) ListDishes(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	groupType := c.Query("group_type")
	groupID, ok := parseUUIDQuery(c, "group_id")
	if !ok {
		return
	}
	dishType := c.Query("dish_type")
	category := c.Query("category")
	keyword := c.Query("keyword")
	page, pageSize := parsePagination(c)

	if groupType == "" || groupID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 group_type 或 group_id"})
		return
	}

	dishes, total, err := h.service.ListDishes(c.Request.Context(), uid, groupType, groupID, dishType, category, keyword, page, pageSize)
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

// ImportFromPlaza 从学菜广场导入菜品：body 指定 plaza_id 和目标组合，导入后成为用户菜品。
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

	plazaID, err := uuid.Parse(req.PlazaID)
	if err != nil || plazaID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "无效的 plaza_id"})
		return
	}
	groupID, err := uuid.Parse(req.GroupID)
	if err != nil || groupID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "无效的 group_id"})
		return
	}

	dish, err := h.service.ImportFromPlaza(c.Request.Context(), uid, plazaID, req.GroupType, groupID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "导入成功", "data": dish})
}

// SearchPlaza 搜索学菜广场：公开广场数据按分类/关键词过滤并分页返回。
// GET /api/v1/plaza?category=&keyword=&page=1&page_size=20
func (h *DishHandler) SearchPlaza(c *gin.Context) {
	category := c.Query("category")
	keyword := c.Query("keyword")
	page, pageSize := parsePagination(c)

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

// GetPlazaCategories 获取学菜广场分类：当前返回 service 中的预设分类。
// GET /api/v1/plaza/categories
func (h *DishHandler) GetPlazaCategories(c *gin.Context) {
	categories, _ := h.service.GetPlazaCategories(c.Request.Context())
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": categories})
}
