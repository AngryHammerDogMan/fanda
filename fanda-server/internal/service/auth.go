// Package service 承载业务规则、权限检查和事务编排，handler 只负责 HTTP 适配。
package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"fanda-server/internal/config"
	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthService struct {
	cfg *config.Config
}

// NewAuthService 创建认证服务，JWT 签发依赖传入的运行配置。
func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{cfg: cfg}
}

// LoginResult 登录返回
type LoginResult struct {
	Token         string `json:"token"`
	UID           string `json:"uid"`
	Nickname      string `json:"nickname"`
	Avatar        string `json:"avatar"`
	IsNew         bool   `json:"is_new"`
	NeedBindPhone bool   `json:"need_bind_phone"`
	Phone         string `json:"phone,omitempty"`
}

// Login 平台登录：用平台 code 换取 openid，按 openid 查找/创建用户并签发 JWT。
func (s *AuthService) Login(ctx context.Context, platform, code string) (*LoginResult, error) {
	// 通过平台 code 换取 openid（开发阶段用模拟数据，上线后替换为真实 API 调用）
	openID, err := s.exchangeOpenID(platform, code)
	if err != nil {
		return nil, fmt.Errorf("获取 openid 失败: %w", err)
	}

	// openid 是平台账号的唯一标识；首次登录只创建平台账号，手机号稍后用于跨平台合并。
	var user model.User
	openIDField := s.getOpenIDField(platform)
	openIDVal := openID

	err = database.DB.Where(openIDField+" = ?", openIDVal).First(&user).Error
	isNew := false

	if errors.Is(err, gorm.ErrRecordNotFound) {
		user = model.User{
			Nickname: fmt.Sprintf("用户%s", hex.EncodeToString([]byte(openID))[:6]),
		}
		switch platform {
		case "wechat":
			user.WxOpenID = &openIDVal
		case "douyin":
			user.DyOpenID = &openIDVal
		}
		if err := database.DB.Create(&user).Error; err != nil {
			return nil, fmt.Errorf("创建用户失败: %w", err)
		}
		isNew = true
	} else if err != nil {
		return nil, fmt.Errorf("查询用户失败: %w", err)
	}

	// JWT 携带 uid/platform，后续接口通过中间件还原当前用户身份。
	token, err := s.generateJWT(user.UID, platform)
	if err != nil {
		return nil, fmt.Errorf("生成令牌失败: %w", err)
	}

	// 手机号脱敏
	phoneMasked := ""
	if user.Phone != nil {
		phoneMasked = maskPhone(*user.Phone)
	}

	return &LoginResult{
		Token:         token,
		UID:           user.UID.String(),
		Nickname:      user.Nickname,
		Avatar:        user.Avatar,
		IsNew:         isNew,
		NeedBindPhone: user.Phone == nil,
		Phone:         phoneMasked,
	}, nil
}

// BindPhone 绑定手机号；手机号已存在时把当前平台账号合并到已有手机号账号。
func (s *AuthService) BindPhone(ctx context.Context, uid interface{}, phone string) error {
	userID := uid.(uuid.UUID)

	// 验证手机号格式（简单校验）
	if len(phone) != 11 {
		return errors.New("手机号格式不正确")
	}
	for _, c := range phone {
		if c < '0' || c > '9' {
			return errors.New("手机号格式不正确")
		}
	}

	// 手机号是跨平台账号的归并键：同一手机号下保留一个用户主体。
	var existingUser model.User
	err := database.DB.Where("phone = ? AND uid != ?", phone, userID).First(&existingUser).Error
	if err == nil {
		// 手机号已被其他用户绑定，执行账户合并
		return s.mergeAccounts(userID, existingUser.UID, phone)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("查询手机号失败: %w", err)
	}

	// 手机号未被使用，直接绑定
	return database.DB.Model(&model.User{}).Where("uid = ?", userID).Update("phone", phone).Error
}

// mergeAccounts 在单个事务内合并两个账户：迁移 sourceUser 数据到 targetUser，
// 先处理唯一 openid 冲突，再迁移业务数据、关系和邀请记录，最后删除源账号。
func (s *AuthService) mergeAccounts(sourceUID, targetUID uuid.UUID, phone string) error {
	tx := database.DB.Begin()

	// 在事务内查询两个用户
	var sourceUser, targetUser model.User
	if err := tx.First(&sourceUser, "uid = ?", sourceUID).Error; err != nil {
		tx.Rollback()
		return errors.New("源用户不存在")
	}
	if err := tx.First(&targetUser, "uid = ?", targetUID).Error; err != nil {
		tx.Rollback()
		return errors.New("目标用户不存在")
	}

	// 合并 openid：先清空 sourceUser 的 openid（避免唯一约束冲突），再设到 targetUser
	updates := map[string]interface{}{}
	if sourceUser.WxOpenID != nil && targetUser.WxOpenID == nil {
		updates["wx_openid"] = *sourceUser.WxOpenID
		// 先清空源用户的 wx_openid
		if err := tx.Model(&model.User{}).Where("uid = ?", sourceUID).Update("wx_openid", nil).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("清空源用户wx_openid失败: %w", err)
		}
	}
	if sourceUser.DyOpenID != nil && targetUser.DyOpenID == nil {
		updates["dy_openid"] = *sourceUser.DyOpenID
		// 先清空源用户的 dy_openid
		if err := tx.Model(&model.User{}).Where("uid = ?", sourceUID).Update("dy_openid", nil).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("清空源用户dy_openid失败: %w", err)
		}
	}
	if len(updates) > 0 {
		if err := tx.Model(&model.User{}).Where("uid = ?", targetUID).Updates(updates).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("合并openid失败: %w", err)
		}
	}

	// 将 sourceUser 名下的数据迁移到 targetUser；任一步失败都回滚，避免半合并状态。
	if err := tx.Model(&model.Dish{}).Where("owner_id = ?", sourceUID).Update("owner_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移菜品失败: %w", err)
	}
	if err := tx.Model(&model.Order{}).Where("creator_id = ?", sourceUID).Update("creator_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移订单失败: %w", err)
	}
	if err := tx.Model(&model.CalendarRecord{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移日历记录失败: %w", err)
	}
	if err := tx.Model(&model.RecordComment{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移留言失败: %w", err)
	}
	if err := tx.Model(&model.WishItem{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移心愿失败: %w", err)
	}
	if err := tx.Model(&model.Checkin{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移签到失败: %w", err)
	}
	if err := tx.Model(&model.PointRecord{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移积分记录失败: %w", err)
	}
	if err := tx.Model(&model.BudgetSetting{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移预算失败: %w", err)
	}
	if err := tx.Model(&model.ShoppingBasket{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移菜篮子失败: %w", err)
	}
	if err := tx.Model(&model.OrderVote{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移投票失败: %w", err)
	}

	// 情侣关系
	if err := tx.Model(&model.Couple{}).Where("user1_id = ?", sourceUID).Update("user1_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移情侣关系失败: %w", err)
	}
	if err := tx.Model(&model.Couple{}).Where("user2_id = ?", sourceUID).Update("user2_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移情侣关系失败: %w", err)
	}
	// 饭搭子成员
	if err := tx.Model(&model.BuddyMember{}).Where("user_id = ?", sourceUID).Update("user_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移饭搭子成员失败: %w", err)
	}
	// 饭搭子群主
	if err := tx.Model(&model.BuddyGroup{}).Where("owner_id = ?", sourceUID).Update("owner_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移饭搭子群主失败: %w", err)
	}
	// 邀请码
	if err := tx.Model(&model.CoupleInvite{}).Where("inviter_id = ?", sourceUID).Update("inviter_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移情侣邀请码失败: %w", err)
	}
	if err := tx.Model(&model.BuddyInvite{}).Where("inviter_id = ?", sourceUID).Update("inviter_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移饭搭子邀请码失败: %w", err)
	}
	// 积分合并采用累加策略，避免跨平台使用产生的积分丢失。
	if err := tx.Model(&model.User{}).Where("uid = ?", targetUID).Update("points", targetUser.Points+sourceUser.Points).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("合并积分失败: %w", err)
	}

	// 删除 sourceUser
	if err := tx.Delete(&sourceUser).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("删除源用户失败: %w", err)
	}

	return tx.Commit().Error
}

// GetProfile 获取用户信息，并附带当前活跃情侣关系与饭搭子组合概览。
func (s *AuthService) GetProfile(ctx context.Context, uid interface{}) (map[string]interface{}, error) {
	userID := uid.(uuid.UUID)

	var user model.User
	if err := database.DB.First(&user, "uid = ?", userID).Error; err != nil {
		return nil, errors.New("用户不存在")
	}

	// 查询情侣关系
	var couple *model.Couple
	database.DB.Where("(user1_id = ? OR user2_id = ?) AND status = 'active'", userID, userID).First(&couple)

	// 查询饭搭子组合
	var buddyGroups []model.BuddyGroup
	database.DB.
		Joins("JOIN buddy_members ON buddy_members.group_id = buddy_groups.id").
		Where("buddy_members.user_id = ? AND buddy_groups.status = 'active'", userID).
		Find(&buddyGroups)

	// 手机号脱敏
	phoneMasked := ""
	if user.Phone != nil {
		phoneMasked = maskPhone(*user.Phone)
	}

	return map[string]interface{}{
		"uid":          user.UID,
		"nickname":     user.Nickname,
		"avatar":       user.Avatar,
		"points":       user.Points,
		"has_wx":       user.WxOpenID != nil,
		"has_dy":       user.DyOpenID != nil,
		"phone":        phoneMasked,
		"has_phone":    user.Phone != nil,
		"couple":       coupleToMap(couple),
		"buddy_groups": buddyGroups,
		"created_at":   user.CreatedAt,
	}, nil
}

// UpdateProfile 更新用户信息
func (s *AuthService) UpdateProfile(ctx context.Context, uid interface{}, nickname, avatar string) error {
	userID := uid.(uuid.UUID)

	updates := map[string]interface{}{}
	if nickname != "" {
		updates["nickname"] = nickname
	}
	if avatar != "" {
		updates["avatar"] = avatar
	}

	if len(updates) == 0 {
		return errors.New("没有需要更新的字段")
	}

	return database.DB.Model(&model.User{}).Where("uid = ?", userID).Updates(updates).Error
}

// CreateCoupleInvite 生成 30 分钟有效的情侣邀请码，已有伴侣时拒绝生成。
func (s *AuthService) CreateCoupleInvite(ctx context.Context, uid interface{}) (map[string]interface{}, error) {
	userID := uid.(uuid.UUID)

	// 检查是否已有伴侣
	var couple model.Couple
	if err := database.DB.Where("(user1_id = ? OR user2_id = ?) AND status = 'active'", userID, userID).First(&couple).Error; err == nil {
		return nil, errors.New("你已有情侣关系，请先解除后再邀请")
	}

	code := generateCode(6)

	invite := model.CoupleInvite{
		InviterID: userID,
		Code:      code,
		ExpiresAt: time.Now().Add(30 * time.Minute),
	}

	if err := database.DB.Create(&invite).Error; err != nil {
		return nil, fmt.Errorf("生成邀请码失败: %w", err)
	}

	return map[string]interface{}{
		"code":       code,
		"expires_at": invite.ExpiresAt,
	}, nil
}

// JoinCouple 通过邀请码绑定情侣；创建关系和标记邀请码已用必须在同一事务内完成。
func (s *AuthService) JoinCouple(ctx context.Context, uid interface{}, code string) error {
	userID := uid.(uuid.UUID)

	var invite model.CoupleInvite
	if err := database.DB.Where("code = ? AND is_used = false AND expires_at > ?", code, time.Now()).First(&invite).Error; err != nil {
		return errors.New("邀请码无效或已过期")
	}

	if invite.InviterID == userID {
		return errors.New("不能邀请自己")
	}

	// 检查双方是否已有伴侣
	var existingCouple model.Couple
	if err := database.DB.Where(
		"(user1_id = ? OR user2_id = ? OR user1_id = ? OR user2_id = ?) AND status = 'active'",
		userID, userID, invite.InviterID, invite.InviterID,
	).First(&existingCouple).Error; err == nil {
		return errors.New("其中一方已有情侣关系")
	}

	tx := database.DB.Begin()

	couple := model.Couple{
		User1ID: invite.InviterID,
		User2ID: userID,
		Status:  "active",
	}
	if err := tx.Create(&couple).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("创建情侣关系失败: %w", err)
	}

	invite.IsUsed = true
	if err := tx.Save(&invite).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("更新邀请码状态失败: %w", err)
	}

	return tx.Commit().Error
}

// CreateBuddyGroup 创建饭搭子组合，并同步把创建人写为 owner 成员。
func (s *AuthService) CreateBuddyGroup(ctx context.Context, uid interface{}, name string) (map[string]interface{}, error) {
	userID := uid.(uuid.UUID)

	// 检查已有组合数量（上限 3 个）
	var count int64
	database.DB.Model(&model.BuddyMember{}).Where("user_id = ?", userID).Count(&count)
	if count >= 3 {
		return nil, errors.New("最多加入 3 个饭搭子组合")
	}

	tx := database.DB.Begin()

	group := model.BuddyGroup{
		Name:    name,
		OwnerID: userID,
	}
	if err := tx.Create(&group).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建组合失败: %w", err)
	}

	member := model.BuddyMember{
		GroupID: group.ID,
		UserID:  userID,
		Role:    "owner",
	}
	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("添加成员失败: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return map[string]interface{}{
		"id":   group.ID,
		"name": group.Name,
	}, nil
}

// CreateBuddyInvite 生成饭搭子邀请码，仅 owner/admin 可以邀请新成员。
func (s *AuthService) CreateBuddyInvite(ctx context.Context, uid interface{}, groupID string) (map[string]interface{}, error) {
	userID := uid.(uuid.UUID)
	gID, err := uuid.Parse(groupID)
	if err != nil || gID == uuid.Nil {
		return nil, errors.New("组合ID无效")
	}

	// 检查权限
	var member model.BuddyMember
	if err := database.DB.Where("group_id = ? AND user_id = ? AND role IN ('owner','admin')", gID, userID).First(&member).Error; err != nil {
		return nil, errors.New("没有邀请权限")
	}

	code := generateCode(6)

	invite := model.BuddyInvite{
		GroupID:   gID,
		InviterID: userID,
		Code:      code,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}

	if err := database.DB.Create(&invite).Error; err != nil {
		return nil, fmt.Errorf("生成邀请码失败: %w", err)
	}

	return map[string]interface{}{
		"code":       code,
		"expires_at": invite.ExpiresAt,
	}, nil
}

// JoinBuddyGroup 通过邀请码加入饭搭子，依次校验邀请码、成员上限和重复加入。
func (s *AuthService) JoinBuddyGroup(ctx context.Context, uid interface{}, groupID string, code string) error {
	userID := uid.(uuid.UUID)
	gID, err := uuid.Parse(groupID)
	if err != nil || gID == uuid.Nil {
		return errors.New("组合ID无效")
	}

	var invite model.BuddyInvite
	if err := database.DB.Where("code = ? AND is_used = false AND expires_at > ?", code, time.Now()).First(&invite).Error; err != nil {
		return errors.New("邀请码无效或已过期")
	}
	if invite.GroupID != gID {
		return errors.New("邀请码与组合不匹配")
	}

	// 检查已有组合数量
	var count int64
	database.DB.Model(&model.BuddyMember{}).Where("user_id = ?", userID).Count(&count)
	if count >= 3 {
		return errors.New("最多加入 3 个饭搭子组合")
	}

	// 检查是否已在组内
	var existing model.BuddyMember
	if err := database.DB.Where("group_id = ? AND user_id = ?", invite.GroupID, userID).First(&existing).Error; err == nil {
		return errors.New("你已在组合中")
	}

	// 检查人数上限
	var group model.BuddyGroup
	if err := database.DB.First(&group, "id = ?", invite.GroupID).Error; err != nil {
		return errors.New("组合不存在")
	}

	var memberCount int64
	database.DB.Model(&model.BuddyMember{}).Where("group_id = ?", invite.GroupID).Count(&memberCount)
	if memberCount >= int64(group.MaxMember) {
		return errors.New("组合人数已满")
	}

	tx := database.DB.Begin()

	member := model.BuddyMember{
		GroupID: invite.GroupID,
		UserID:  userID,
		Role:    "member",
	}
	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("加入组合失败: %w", err)
	}

	invite.IsUsed = true
	if err := tx.Save(&invite).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("更新邀请码状态失败: %w", err)
	}

	return tx.Commit().Error
}

// RemoveBuddyMember 移除饭搭子成员，仅 owner/admin 可操作且不能移除自己。
func (s *AuthService) RemoveBuddyMember(ctx context.Context, uid interface{}, groupID, targetUID string) error {
	userID := uid.(uuid.UUID)
	gID, err := uuid.Parse(groupID)
	if err != nil || gID == uuid.Nil {
		return errors.New("组合ID无效")
	}
	tID, err := uuid.Parse(targetUID)
	if err != nil || tID == uuid.Nil {
		return errors.New("成员ID无效")
	}

	// 检查权限
	var member model.BuddyMember
	if err := database.DB.Where("group_id = ? AND user_id = ? AND role IN ('owner','admin')", gID, userID).First(&member).Error; err != nil {
		return errors.New("没有移除权限")
	}

	// 不能移除自己
	if userID == tID {
		return errors.New("不能移除自己")
	}

	result := database.DB.Where("group_id = ? AND user_id = ?", gID, tID).Delete(&model.BuddyMember{})
	if result.RowsAffected == 0 {
		return errors.New("成员不存在")
	}

	return nil
}

// ---- 辅助函数 ----

func (s *AuthService) exchangeOpenID(platform, code string) (string, error) {
	// 开发阶段：直接用 code 作为 openid 模拟
	// 上线后替换为真实的微信/抖音 API 调用
	if code == "" {
		return "", errors.New("code 不能为空")
	}
	return platform + "_" + code, nil
}

func (s *AuthService) generateJWT(uid uuid.UUID, platform string) (string, error) {
	claims := jwt.MapClaims{
		"uid":      uid.String(),
		"platform": platform,
		"exp":      time.Now().Add(time.Duration(s.cfg.JWTExpireHours) * time.Hour).Unix(),
		"iat":      time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *AuthService) getOpenIDField(platform string) string {
	switch platform {
	case "wechat":
		return "wx_openid"
	case "douyin":
		return "dy_openid"
	default:
		return "wx_openid"
	}
}

func coupleToMap(c *model.Couple) map[string]interface{} {
	if c == nil {
		return nil
	}
	return map[string]interface{}{
		"id":       c.ID,
		"user1_id": c.User1ID,
		"user2_id": c.User2ID,
		"status":   c.Status,
	}
}

func generateCode(length int) string {
	bytes := make([]byte, length/2+1)
	rand.Read(bytes)
	code := hex.EncodeToString(bytes)[:length]
	return code
}

// maskPhone 手机号脱敏：138****1234
func maskPhone(phone string) string {
	if len(phone) != 11 {
		return phone
	}
	return phone[:3] + "****" + phone[7:]
}
