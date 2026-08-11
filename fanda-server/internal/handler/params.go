// Package handler 负责 HTTP 请求参数绑定、错误响应和 service 调用编排。
package handler

import (
	"net/http"
	"strconv"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// parseUUIDParam 解析路径中的 UUID；失败时直接写 400 响应，调用方用 bool 提前返回。
func parseUUIDParam(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil || id == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "无效的" + name})
		return uuid.Nil, false
	}
	return id, true
}

// parseUUIDQuery 解析查询参数中的 UUID，用于 group_id 等必须明确归属的资源参数。
func parseUUIDQuery(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Query(name))
	if err != nil || id == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "无效的" + name})
		return uuid.Nil, false
	}
	return id, true
}

// parsePagination 统一读取 page/page_size，并交给 service.NormalizePagination 做边界修正。
func parsePagination(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	return service.NormalizePagination(page, pageSize)
}
