package handler

import (
	"net/http"
	"strconv"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CalendarHandler struct {
	service *service.CalendarService
}

func NewCalendarHandler() *CalendarHandler {
	return &CalendarHandler{
		service: service.NewCalendarService(),
	}
}

// CreateRecord 创建日历记录
// POST /api/v1/calendar/records
func (h *CalendarHandler) CreateRecord(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	var req service.CreateRecordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	record, err := h.service.CreateRecord(c.Request.Context(), uid, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": record})
}

// UpdateRecord 更新日历记录
// PUT /api/v1/calendar/records/:id
func (h *CalendarHandler) UpdateRecord(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, _ := uuid.Parse(c.Param("id"))

	var req service.UpdateRecordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.UpdateRecord(c.Request.Context(), uid, recordID, req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// DeleteRecord 删除日历记录
// DELETE /api/v1/calendar/records/:id
func (h *CalendarHandler) DeleteRecord(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, _ := uuid.Parse(c.Param("id"))

	if err := h.service.DeleteRecord(c.Request.Context(), uid, recordID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// GetRecord 获取记录详情
// GET /api/v1/calendar/records/:id
func (h *CalendarHandler) GetRecord(c *gin.Context) {
	recordID, _ := uuid.Parse(c.Param("id"))

	record, err := h.service.GetRecord(c.Request.Context(), recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": record})
}

// ListRecords 按月获取日历记录
// GET /api/v1/calendar/records?group_type=couple&group_id=xxx&year=2026&month=8
func (h *CalendarHandler) ListRecords(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))
	year, _ := strconv.Atoi(c.DefaultQuery("year", "2026"))
	month, _ := strconv.Atoi(c.DefaultQuery("month", "8"))

	if groupType == "" || groupID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 group_type 或 group_id"})
		return
	}

	records, err := h.service.ListRecords(c.Request.Context(), groupType, groupID, year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": records})
}

// ListRecordsByDate 按日期获取记录
// GET /api/v1/calendar/records/date?group_type=couple&group_id=xxx&date=2026-08-08
func (h *CalendarHandler) ListRecordsByDate(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))
	date := c.Query("date")

	if groupType == "" || groupID == uuid.Nil || date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少必要参数"})
		return
	}

	records, err := h.service.ListRecordsByDate(c.Request.Context(), groupType, groupID, date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": records})
}

// AddComment 添加留言
// POST /api/v1/calendar/records/:id/comments
func (h *CalendarHandler) AddComment(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, _ := uuid.Parse(c.Param("id"))

	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	comment, err := h.service.AddComment(c.Request.Context(), uid, recordID, req.Content)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": comment})
}

// AddPhoto 添加照片
// POST /api/v1/calendar/records/:id/photos
func (h *CalendarHandler) AddPhoto(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, _ := uuid.Parse(c.Param("id"))

	var req struct {
		URL  string `json:"url" binding:"required"`
		Type string `json:"type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	photo, err := h.service.AddPhoto(c.Request.Context(), uid, recordID, req.URL, req.Type)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": photo})
}

// GetMonthlyStats 获取月度统计
// GET /api/v1/calendar/stats?group_type=couple&group_id=xxx&year=2026&month=8
func (h *CalendarHandler) GetMonthlyStats(c *gin.Context) {
	groupType := c.Query("group_type")
	groupID, _ := uuid.Parse(c.Query("group_id"))
	year, _ := strconv.Atoi(c.DefaultQuery("year", "2026"))
	month, _ := strconv.Atoi(c.DefaultQuery("month", "8"))

	if groupType == "" || groupID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 group_type 或 group_id"})
		return
	}

	stats, err := h.service.GetMonthlyStats(c.Request.Context(), groupType, groupID, year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": stats})
}