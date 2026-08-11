package handler

import (
	"net/http"

	"fanda-server/internal/config"
	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct {
	cfg     *config.Config
	service *service.AuthService
}

// NewAuthHandler 组装认证相关 handler，底层 service 负责账号、关系和邀请码规则。
func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		cfg:     cfg,
		service: service.NewAuthService(cfg),
	}
}

// Login 平台登录：接收微信/抖音 code 与平台标识，返回用户 JWT 和是否需要绑定手机号。
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

// GetProfile 获取当前用户资料：uid 来自鉴权中间件，返回账号绑定状态和关系信息。
// GET /api/v1/auth/profile
func (h *AuthHandler) GetProfile(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

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

// UpdateProfile 更新用户昵称/头像；空请求由 service 作为业务错误返回。
// PUT /api/v1/auth/profile
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

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

// BindPhone 绑定手机号；手机号已存在时会自动合并账号，实现跨平台数据互通
// POST /api/v1/auth/bind-phone
func (h *AuthHandler) BindPhone(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

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

// CreateCoupleInvite 生成情侣邀请码；请求无需 body，当前登录用户作为邀请人。
// POST /api/v1/couple/invite
func (h *AuthHandler) CreateCoupleInvite(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

	result, err := h.service.CreateCoupleInvite(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}

// JoinCouple 通过 6 位邀请码绑定情侣关系，邀请码校验和“一人一个伴侣”规则在 service 中完成。
// POST /api/v1/couple/join
func (h *AuthHandler) JoinCouple(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

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

// CreateBuddyGroup 创建饭搭子组合；请求只提交组合名称，创建者自动成为 owner。
// POST /api/v1/buddy/groups
func (h *AuthHandler) CreateBuddyGroup(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)

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

// CreateBuddyInvite 为指定饭搭子组合生成邀请码，组合管理员/群主权限由 service 校验。
// POST /api/v1/buddy/groups/:id/invite
func (h *AuthHandler) CreateBuddyInvite(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	groupID := c.Param("id")

	result, err := h.service.CreateBuddyInvite(c.Request.Context(), uid, groupID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": result})
}

// JoinBuddyGroup 通过邀请码加入饭搭子组合，同时校验 group_id 与邀请码是否匹配。
// POST /api/v1/buddy/groups/:id/join
func (h *AuthHandler) JoinBuddyGroup(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	groupID := c.Param("id")

	var req struct {
		Code string `json:"code" binding:"required,len=6"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}

	if err := h.service.JoinBuddyGroup(c.Request.Context(), uid, groupID, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "加入成功"})
}

// RemoveBuddyMember 移除饭搭子成员；路径中的 :id 是组合，:uid 是被移除成员。
// DELETE /api/v1/buddy/groups/:id/members/:uid
func (h *AuthHandler) RemoveBuddyMember(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	groupID := c.Param("id")
	targetUID := c.Param("uid")

	if err := h.service.RemoveBuddyMember(c.Request.Context(), uid, groupID, targetUID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "移除成功"})
}
