package handler

import (
	"net/http"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TableHandler struct {
	service *service.TableService
}

func NewTableHandler() *TableHandler {
	return &TableHandler{service: service.NewTableService()}
}

// ListTables 返回当前用户可访问的餐桌列表，并由服务层自动补齐默认个人餐桌。
func (h *TableHandler) ListTables(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tables, err := h.service.ListTables(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": tables})
}

// RenameTable 重命名餐桌，仅餐桌创建者可操作。
func (h *TableHandler) RenameTable(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	table, err := h.service.RenameTable(c.Request.Context(), uid, tableID, req.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": table})
}
