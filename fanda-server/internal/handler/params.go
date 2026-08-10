package handler

import (
	"net/http"
	"strconv"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func parseUUIDParam(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil || id == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "无效的" + name})
		return uuid.Nil, false
	}
	return id, true
}

func parseUUIDQuery(c *gin.Context, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Query(name))
	if err != nil || id == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "无效的" + name})
		return uuid.Nil, false
	}
	return id, true
}

func parsePagination(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	return service.NormalizePagination(page, pageSize)
}
