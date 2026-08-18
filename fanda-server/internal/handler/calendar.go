package handler

import (
	"net/http"
	"strconv"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CalendarHandler 负责日历记录、记录照片、留言和月度统计的 HTTP 适配。
type CalendarHandler struct {
	service *service.CalendarService // 日历业务服务
}

// NewCalendarHandler 创建日历记录 handler，承接吃饭记录、照片、留言和统计接口。
func NewCalendarHandler() *CalendarHandler {
	return &CalendarHandler{
		service: service.NewCalendarService(),
	}
}

// CreateRecord 创建日历记录：body 描述日期、餐型、金额、照片和留言等一次用餐信息。
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

// UpdateRecord 更新日历记录：路径 id 指定记录，仅创建人可修改基础字段。
// PUT /api/v1/calendar/records/:id
func (h *CalendarHandler) UpdateRecord(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

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

// DeleteRecord 删除日历记录：路径 id 指定记录，仅创建人可删除。
// DELETE /api/v1/calendar/records/:id
func (h *CalendarHandler) DeleteRecord(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteRecord(c.Request.Context(), uid, recordID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// GetRecord 获取记录详情：返回记录及预加载的照片、留言。
// GET /api/v1/calendar/records/:id
func (h *CalendarHandler) GetRecord(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

	record, err := h.service.GetRecord(c.Request.Context(), uid, recordID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"code": 404, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": record})
}

// ListRecords 按月获取日历记录：year/month 组成月份窗口，不走分页。
// GET /api/v1/calendar/records?table_id=example-table-id&status=&year=2026&month=8
func (h *CalendarHandler) ListRecords(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDQuery(c, "table_id")
	if !ok {
		return
	}
	status := c.Query("status")
	year, _ := strconv.Atoi(c.DefaultQuery("year", "2026"))
	month, _ := strconv.Atoi(c.DefaultQuery("month", "8"))

	if tableID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 table_id"})
		return
	}

	records, err := h.service.ListRecords(c.Request.Context(), uid, tableID, status, year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": records})
}

// ListRecordsByDate 按日期获取记录：date 必须是 YYYY-MM-DD。
// GET /api/v1/calendar/records/date?table_id=example-table-id&status=&date=2026-08-08
func (h *CalendarHandler) ListRecordsByDate(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDQuery(c, "table_id")
	if !ok {
		return
	}
	status := c.Query("status")
	date := c.Query("date")

	if tableID == uuid.Nil || date == "" {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少必要参数"})
		return
	}

	records, err := h.service.ListRecordsByDate(c.Request.Context(), uid, tableID, status, date)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": records})
}

// AddComment 添加留言：body.content 是追加到指定记录的文本内容。
// POST /api/v1/calendar/records/:id/comments
func (h *CalendarHandler) AddComment(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

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

// AddPhoto 添加照片：body.url 是已上传资源地址，type 默认为 image。
// POST /api/v1/calendar/records/:id/photos
func (h *CalendarHandler) AddPhoto(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	recordID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}

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

// GetMonthlyStats 获取月度统计：按餐桌和月份聚合金额、餐型数量和缺金额记录。
// GET /api/v1/calendar/stats?table_id=example-table-id&year=2026&month=8
func (h *CalendarHandler) GetMonthlyStats(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDQuery(c, "table_id")
	if !ok {
		return
	}
	year, _ := strconv.Atoi(c.DefaultQuery("year", "2026"))
	month, _ := strconv.Atoi(c.DefaultQuery("month", "8"))

	if tableID == uuid.Nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "缺少 table_id"})
		return
	}

	stats, err := h.service.GetMonthlyStats(c.Request.Context(), uid, tableID, year, month)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": stats})
}
