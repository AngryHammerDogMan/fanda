package handler

import (
	"net/http"

	"fanda-server/internal/config"
	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	cfg     *config.Config
	service *service.AuthService
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		cfg:     cfg,
		service: service.NewAuthService(cfg),
	}
}

// Login 平台登录
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Code     string `json:"code" binding:"required"`
		Platform string `json:"platform" binding:"required,oneof=wechat douyin"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误: " + err.Error()})
		return
	}

	result, err := h.service.Login(c.Request.Context(), req.Platform, req.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data":    result,
	})
}

// LoginByPhone 手机号登录/注册
// POST /api/v1/auth/login/phone
func (h *AuthHandler) LoginByPhone(c *gin.Context) {
	var req struct {
		Phone string `json:"phone" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "请输入手机号"})
		return
	}

	result, err := h.service.LoginByPhone(c.Request.Context(), req.Phone)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data":    result,
	})
}

// GenerateBindCode 生成跨平台绑定码
// POST /api/v1/auth/bind-code
func (h *AuthHandler) GenerateBindCode(c *gin.Context) {
	uid := c.MustGet("uid")

	result, err := h.service.GenerateBindCode(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data":    result,
	})
}

// BindPlatform 通过绑定码关联平台
// POST /api/v1/auth/bind
func (h *AuthHandler) BindPlatform(c *gin.Context) {
	uid := c.MustGet("uid")

	var req struct {
		BindCode string `json:"bind_code" binding:"required,len=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.BindPlatform(c.Request.Context(), uid, req.BindCode); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "绑定成功"})
}

// GetProfile 获取用户信息
// GET /api/v1/auth/profile
func (h *AuthHandler) GetProfile(c *gin.Context) {
	uid := c.MustGet("uid")

	result, err := h.service.GetProfile(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":    0,
		"message": "ok",
		"data":    result,
	})
}

// UpdateProfile 更新用户信息
// PUT /api/v1/auth/profile
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	uid := c.MustGet("uid")

	var req struct {
		Nickname string `json:"nickname"`
		Avatar   string `json:"avatar"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.UpdateProfile(c.Request.Context(), uid, req.Nickname, req.Avatar); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "更新成功"})
}

// BindPhone 绑定手机号
// POST /api/v1/auth/bind-phone
func (h *AuthHandler) BindPhone(c *gin.Context) {
	uid := c.MustGet("uid")

	var req struct {
		Phone string `json:"phone" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "请输入手机号"})
		return
	}

	if err := h.service.BindPhone(c.Request.Context(), uid, req.Phone); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "手机号绑定成功"})
}

// CreateCoupleInvite 生成情侣邀请码
// POST /api/v1/couple/invite
func (h *AuthHandler) CreateCoupleInvite(c *gin.Context) {
	uid := c.MustGet("uid")

	result, err := h.service.CreateCoupleInvite(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}

// JoinCouple 通过邀请码绑定情侣
// POST /api/v1/couple/join
func (h *AuthHandler) JoinCouple(c *gin.Context) {
	uid := c.MustGet("uid")

	var req struct {
		Code string `json:"code" binding:"required,len=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.JoinCouple(c.Request.Context(), uid, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "情侣关系绑定成功"})
}

// CreateBuddyGroup 创建饭搭子组合
// POST /api/v1/buddy/groups
func (h *AuthHandler) CreateBuddyGroup(c *gin.Context) {
	uid := c.MustGet("uid")

	var req struct {
		Name string `json:"name" binding:"required,max=50"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	result, err := h.service.CreateBuddyGroup(c.Request.Context(), uid, req.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}

// CreateBuddyInvite 生成饭搭子邀请码
// POST /api/v1/buddy/groups/:id/invite
func (h *AuthHandler) CreateBuddyInvite(c *gin.Context) {
	uid := c.MustGet("uid")
	groupID := c.Param("id")

	result, err := h.service.CreateBuddyInvite(c.Request.Context(), uid, groupID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}

// JoinBuddyGroup 通过邀请码加入饭搭子
// POST /api/v1/buddy/groups/:id/join
func (h *AuthHandler) JoinBuddyGroup(c *gin.Context) {
	uid := c.MustGet("uid")

	var req struct {
		Code string `json:"code" binding:"required,len=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.JoinBuddyGroup(c.Request.Context(), uid, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "加入成功"})
}

// RemoveBuddyMember 移除饭搭子成员
// DELETE /api/v1/buddy/groups/:id/members/:uid
func (h *AuthHandler) RemoveBuddyMember(c *gin.Context) {
	uid := c.MustGet("uid")
	groupID := c.Param("id")
	targetUID := c.Param("uid")

	if err := h.service.RemoveBuddyMember(c.Request.Context(), uid, groupID, targetUID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "移除成功"})
}