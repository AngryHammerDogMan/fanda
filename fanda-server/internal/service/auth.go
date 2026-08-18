// Package service 承载业务规则、权限检查和事务编排，handler 只负责 HTTP 适配。
package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"fanda-server/internal/config"
	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// AuthService 负责平台登录、JWT 签发、手机号合并和情侣/饭搭关系维护。
type AuthService struct {
	cfg               *config.Config // 运行配置，包含平台密钥和 JWT 参数
	httpClient        *http.Client   // 可替换 HTTP 客户端，便于测试平台换取 openid
	wxCode2SessionURL string         // 微信 code2session 地址
	dyCode2SessionURL string         // 抖音 code2session 地址
}

// NewAuthService 创建认证服务，JWT 签发依赖传入的运行配置。
func NewAuthService(cfg *config.Config) *AuthService {
	return &AuthService{
		cfg:               cfg,
		httpClient:        http.DefaultClient,
		wxCode2SessionURL: "https://api.weixin.qq.com/sns/jscode2session",
		dyCode2SessionURL: "https://developer.toutiao.com/api/apps/v2/jscode2session",
	}
}

// LoginResult 登录返回
type LoginResult struct {
	Token         string `json:"token"`           // JWT 登录令牌
	UID           string `json:"uid"`             // 用户唯一 ID
	Nickname      string `json:"nickname"`        // 用户昵称
	Avatar        string `json:"avatar"`          // 头像地址
	IsNew         bool   `json:"is_new"`          // 是否首次创建平台账号
	NeedBindPhone bool   `json:"need_bind_phone"` // 是否需要绑定手机号以打通多平台
	Phone         string `json:"phone,omitempty"` // 脱敏手机号
}

// CoupleProfile 是用户资料中返回的情侣关系摘要。
type CoupleProfile struct {
	ID      uuid.UUID `json:"id"`       // 情侣关系 ID
	User1ID uuid.UUID `json:"user1_id"` // 关系中的第一位用户
	User2ID uuid.UUID `json:"user2_id"` // 关系中的第二位用户
	Status  string    `json:"status"`   // 关系状态
}

// ProfileResult 是个人中心资料响应，聚合账号绑定状态和关系信息。
type ProfileResult struct {
	UID         uuid.UUID          `json:"uid"`          // 用户唯一 ID
	Nickname    string             `json:"nickname"`     // 昵称
	Avatar      string             `json:"avatar"`       // 头像地址
	Points      int                `json:"points"`       // 当前积分
	HasWx       bool               `json:"has_wx"`       // 是否绑定微信 openid
	HasDy       bool               `json:"has_dy"`       // 是否绑定抖音 openid
	Phone       string             `json:"phone"`        // 脱敏手机号
	HasPhone    bool               `json:"has_phone"`    // 是否已绑定手机号
	Couple      *CoupleProfile     `json:"couple"`       // 当前情侣关系
	BuddyGroups []model.BuddyGroup `json:"buddy_groups"` // 加入的饭搭子组合
	CreatedAt   time.Time          `json:"created_at"`   // 用户创建时间
}

// InviteResult 是邀请码创建响应，包含邀请码和过期时间。
type InviteResult struct {
	Code      string    `json:"code"`       // 一次性邀请码
	ExpiresAt time.Time `json:"expires_at"` // 过期时间
}

// BuddyGroupSummary 是饭搭子组合的轻量摘要。
type BuddyGroupSummary struct {
	ID   uuid.UUID `json:"id"`   // 饭搭子组合 ID
	Name string    `json:"name"` // 组合名称
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
func (s *AuthService) BindPhone(ctx context.Context, userID uuid.UUID, phone string) error {
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
		return s.mergeAccounts(userID, existingUser.UID)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return fmt.Errorf("查询手机号失败: %w", err)
	}

	// 手机号未被使用，直接绑定
	return database.DB.Model(&model.User{}).Where("uid = ?", userID).Update("phone", phone).Error
}

// mergeAccounts 在单个事务内合并两个账户：迁移 sourceUser 数据到 targetUser，
// 先处理唯一 openid 冲突，再迁移业务数据、关系和邀请记录，最后删除源账号。
func (s *AuthService) mergeAccounts(sourceUID, targetUID uuid.UUID) error {
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
	if sourceUser.WxOpenID != nil && targetUser.WxOpenID == nil {
		// 先清空源用户的 wx_openid
		if err := tx.Model(&model.User{}).Where("uid = ?", sourceUID).Update("wx_openid", nil).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("清空源用户wx_openid失败: %w", err)
		}
		if err := tx.Model(&model.User{}).Where("uid = ?", targetUID).Update("wx_openid", *sourceUser.WxOpenID).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("合并wx_openid失败: %w", err)
		}
	}
	if sourceUser.DyOpenID != nil && targetUser.DyOpenID == nil {
		// 先清空源用户的 dy_openid
		if err := tx.Model(&model.User{}).Where("uid = ?", sourceUID).Update("dy_openid", nil).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("清空源用户dy_openid失败: %w", err)
		}
		if err := tx.Model(&model.User{}).Where("uid = ?", targetUID).Update("dy_openid", *sourceUser.DyOpenID).Error; err != nil {
			tx.Rollback()
			return fmt.Errorf("合并dy_openid失败: %w", err)
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
	if err := mergePersonalTables(tx, sourceUID, targetUID); err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Model(&model.Table{}).Where("owner_id = ?", sourceUID).Update("owner_id", targetUID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("迁移餐桌归属失败: %w", err)
	}
	if err := mergeTableMembers(tx, sourceUID, targetUID); err != nil {
		tx.Rollback()
		return err
	}
	if err := mergeOrderParticipants(tx, sourceUID, targetUID); err != nil {
		tx.Rollback()
		return err
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
	if err := mergeCoupleMembers(tx, sourceUID, targetUID); err != nil {
		tx.Rollback()
		return err
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

func mergePersonalTables(tx *gorm.DB, sourceUID, targetUID uuid.UUID) error {
	var personalTables []model.Table
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("type = ? AND status = ? AND owner_id IN ?", "personal", "active", []uuid.UUID{sourceUID, targetUID}).
		Find(&personalTables).Error; err != nil {
		return fmt.Errorf("锁定个人餐桌失败: %w", err)
	}

	var sourceTable, targetTable *model.Table
	for i := range personalTables {
		switch personalTables[i].OwnerID {
		case sourceUID:
			sourceTable = &personalTables[i]
		case targetUID:
			targetTable = &personalTables[i]
		}
	}
	if sourceTable == nil || targetTable == nil {
		return nil
	}

	if err := tx.Model(&model.Dish{}).Where("table_id = ?", sourceTable.ID).
		Update("table_id", targetTable.ID).Error; err != nil {
		return fmt.Errorf("迁移个人餐桌菜品失败: %w", err)
	}
	if err := tx.Model(&model.Order{}).Where("table_id = ?", sourceTable.ID).
		Update("table_id", targetTable.ID).Error; err != nil {
		return fmt.Errorf("迁移个人餐桌订单失败: %w", err)
	}
	if err := tx.Model(&model.CalendarRecord{}).Where("table_id = ?", sourceTable.ID).
		Update("table_id", targetTable.ID).Error; err != nil {
		return fmt.Errorf("迁移个人餐桌日历失败: %w", err)
	}
	if err := tx.Model(&model.WishItem{}).Where("table_id = ?", sourceTable.ID).
		Update("table_id", targetTable.ID).Error; err != nil {
		return fmt.Errorf("迁移个人餐桌心愿失败: %w", err)
	}
	if err := tx.Model(&model.ShoppingBasket{}).Where("table_id = ?", sourceTable.ID).
		Update("table_id", targetTable.ID).Error; err != nil {
		return fmt.Errorf("迁移个人餐桌菜篮子失败: %w", err)
	}
	if err := tx.Exec(`
		DELETE FROM budget_settings AS source_budget
		WHERE source_budget.table_id = ?
		  AND EXISTS (
			SELECT 1
			FROM budget_settings AS target_budget
			WHERE target_budget.table_id = ?
			  AND target_budget.user_id = source_budget.user_id
			  AND target_budget.month = source_budget.month
		  )
	`, sourceTable.ID, targetTable.ID).Error; err != nil {
		return fmt.Errorf("处理个人餐桌预算冲突失败: %w", err)
	}
	if err := tx.Model(&model.BudgetSetting{}).Where("table_id = ?", sourceTable.ID).
		Update("table_id", targetTable.ID).Error; err != nil {
		return fmt.Errorf("迁移个人餐桌预算失败: %w", err)
	}
	if err := tx.Delete(&model.TableMember{}, "table_id = ?", sourceTable.ID).Error; err != nil {
		return fmt.Errorf("删除源个人餐桌成员失败: %w", err)
	}
	if err := tx.Delete(&model.Table{}, "id = ?", sourceTable.ID).Error; err != nil {
		return fmt.Errorf("删除源个人餐桌失败: %w", err)
	}
	return nil
}

func mergeTableMembers(tx *gorm.DB, sourceUID, targetUID uuid.UUID) error {
	var members []model.TableMember
	if err := tx.Where("user_id = ?", sourceUID).Find(&members).Error; err != nil {
		return fmt.Errorf("查询餐桌成员失败: %w", err)
	}

	for _, member := range members {
		var existingCount int64
		if err := tx.Model(&model.TableMember{}).
			Where("table_id = ? AND user_id = ?", member.TableID, targetUID).
			Count(&existingCount).Error; err != nil {
			return fmt.Errorf("查询餐桌成员冲突失败: %w", err)
		}
		if existingCount > 0 {
			if err := tx.Delete(&model.TableMember{}, "id = ?", member.ID).Error; err != nil {
				return fmt.Errorf("删除重复餐桌成员失败: %w", err)
			}
			continue
		}
		if err := tx.Model(&model.TableMember{}).Where("id = ?", member.ID).Update("user_id", targetUID).Error; err != nil {
			return fmt.Errorf("迁移餐桌成员失败: %w", err)
		}
	}

	return nil
}

func mergeCoupleMembers(tx *gorm.DB, sourceUID, targetUID uuid.UUID) error {
	var sourceMembers []model.CoupleMember
	if err := tx.Where("user_id = ?", sourceUID).Find(&sourceMembers).Error; err != nil {
		return fmt.Errorf("查询情侣成员失败: %w", err)
	}
	for _, member := range sourceMembers {
		var targetCount int64
		if err := tx.Model(&model.CoupleMember{}).
			Where("user_id = ? AND status = ?", targetUID, "active").Count(&targetCount).Error; err != nil {
			return fmt.Errorf("查询情侣成员冲突失败: %w", err)
		}
		if targetCount > 0 && member.Status == "active" {
			return errors.New("源账号和目标账号均存在有效情侣关系，无法自动合并")
		}
		if err := tx.Model(&model.CoupleMember{}).Where("id = ?", member.ID).
			Update("user_id", targetUID).Error; err != nil {
			return fmt.Errorf("迁移情侣成员失败: %w", err)
		}
	}
	return nil
}

func mergeOrderParticipants(tx *gorm.DB, sourceUID, targetUID uuid.UUID) error {
	var participants []model.OrderParticipant
	if err := tx.Where("user_id = ?", sourceUID).Find(&participants).Error; err != nil {
		return fmt.Errorf("查询订单参与人失败: %w", err)
	}

	for _, participant := range participants {
		var existingCount int64
		if err := tx.Model(&model.OrderParticipant{}).
			Where("order_id = ? AND user_id = ?", participant.OrderID, targetUID).
			Count(&existingCount).Error; err != nil {
			return fmt.Errorf("查询订单参与人冲突失败: %w", err)
		}
		if existingCount > 0 {
			if err := tx.Delete(&model.OrderParticipant{}, "id = ?", participant.ID).Error; err != nil {
				return fmt.Errorf("删除重复订单参与人失败: %w", err)
			}
			continue
		}
		if err := tx.Model(&model.OrderParticipant{}).Where("id = ?", participant.ID).Update("user_id", targetUID).Error; err != nil {
			return fmt.Errorf("迁移订单参与人失败: %w", err)
		}
	}

	return nil
}

// GetProfile 获取用户信息，并附带当前活跃情侣关系与饭搭子组合概览。
func (s *AuthService) GetProfile(ctx context.Context, userID uuid.UUID) (*ProfileResult, error) {
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

	return &ProfileResult{
		UID:         user.UID,
		Nickname:    user.Nickname,
		Avatar:      user.Avatar,
		Points:      user.Points,
		HasWx:       user.WxOpenID != nil,
		HasDy:       user.DyOpenID != nil,
		Phone:       phoneMasked,
		HasPhone:    user.Phone != nil,
		Couple:      coupleToProfile(couple),
		BuddyGroups: buddyGroups,
		CreatedAt:   user.CreatedAt,
	}, nil
}

// UpdateProfile 更新用户信息
func (s *AuthService) UpdateProfile(ctx context.Context, userID uuid.UUID, nickname, avatar string) error {
	updated := false
	if nickname != "" {
		if err := database.DB.Model(&model.User{}).Where("uid = ?", userID).Update("nickname", nickname).Error; err != nil {
			return err
		}
		updated = true
	}
	if avatar != "" {
		if err := database.DB.Model(&model.User{}).Where("uid = ?", userID).Update("avatar", avatar).Error; err != nil {
			return err
		}
		updated = true
	}

	if !updated {
		return errors.New("没有需要更新的字段")
	}

	return nil
}

// CreateCoupleInvite 生成 30 分钟有效的情侣邀请码，已有伴侣时拒绝生成。
func (s *AuthService) CreateCoupleInvite(ctx context.Context, userID uuid.UUID) (*InviteResult, error) {
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

	return &InviteResult{
		Code:      code,
		ExpiresAt: invite.ExpiresAt,
	}, nil
}

// JoinCouple 通过邀请码绑定情侣；创建关系和标记邀请码已用必须在同一事务内完成。
func (s *AuthService) JoinCouple(ctx context.Context, userID uuid.UUID, code string) error {
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
		ID:      uuid.New(),
		User1ID: invite.InviterID,
		User2ID: userID,
		Status:  "active",
	}
	if err := tx.Create(&couple).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("创建情侣关系失败: %w", err)
	}
	if err := createCoupleMembers(tx, couple); err != nil {
		tx.Rollback()
		return fmt.Errorf("创建情侣成员失败: %w", err)
	}
	if err := NewTableService().CreateCoupleTable(ctx, tx, couple.ID, invite.InviterID, userID); err != nil {
		tx.Rollback()
		return fmt.Errorf("创建情侣餐桌失败: %w", err)
	}

	invite.IsUsed = true
	if err := tx.Save(&invite).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("更新邀请码状态失败: %w", err)
	}

	return tx.Commit().Error
}

func createCoupleMembers(tx *gorm.DB, couple model.Couple) error {
	members := []model.CoupleMember{
		{ID: uuid.New(), CoupleID: couple.ID, UserID: couple.User1ID, Status: couple.Status},
		{ID: uuid.New(), CoupleID: couple.ID, UserID: couple.User2ID, Status: couple.Status},
	}
	return tx.Create(&members).Error
}

// CreateBuddyGroup 创建饭搭子组合，并同步把创建人写为 owner 成员。
func (s *AuthService) CreateBuddyGroup(ctx context.Context, userID uuid.UUID, name string) (*BuddyGroupSummary, error) {
	// 检查已有组合数量（上限 3 个）
	var count int64
	database.DB.Model(&model.BuddyMember{}).Where("user_id = ?", userID).Count(&count)
	if count >= 3 {
		return nil, errors.New("最多加入 3 个饭搭子组合")
	}

	tx := database.DB.Begin()

	group := model.BuddyGroup{
		ID:      uuid.New(),
		Name:    name,
		OwnerID: userID,
	}
	if err := tx.Create(&group).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建组合失败: %w", err)
	}

	member := model.BuddyMember{
		ID:      uuid.New(),
		GroupID: group.ID,
		UserID:  userID,
		Role:    "owner",
	}
	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("添加成员失败: %w", err)
	}
	if err := NewTableService().CreateBuddyTable(ctx, tx, group.ID, userID, group.Name); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("创建饭搭餐桌失败: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return &BuddyGroupSummary{
		ID:   group.ID,
		Name: group.Name,
	}, nil
}

// CreateBuddyInvite 生成饭搭子邀请码，仅 owner/admin 可以邀请新成员。
func (s *AuthService) CreateBuddyInvite(ctx context.Context, userID uuid.UUID, groupID string) (*InviteResult, error) {
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

	return &InviteResult{
		Code:      code,
		ExpiresAt: invite.ExpiresAt,
	}, nil
}

// JoinBuddyGroup 通过邀请码加入饭搭子，依次校验邀请码、成员上限和重复加入。
func (s *AuthService) JoinBuddyGroup(ctx context.Context, userID uuid.UUID, groupID string, code string) error {
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
		ID:      uuid.New(),
		GroupID: invite.GroupID,
		UserID:  userID,
		Role:    "member",
	}
	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("加入组合失败: %w", err)
	}
	if err := NewTableService().AddBuddyTableMember(ctx, tx, invite.GroupID, userID, "member"); err != nil {
		tx.Rollback()
		return fmt.Errorf("加入饭搭餐桌失败: %w", err)
	}
	invite.IsUsed = true
	if err := tx.Save(&invite).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("更新邀请码状态失败: %w", err)
	}

	return tx.Commit().Error
}

// RemoveBuddyMember 移除饭搭子成员，仅 owner/admin 可操作且不能移除自己。
func (s *AuthService) RemoveBuddyMember(ctx context.Context, userID uuid.UUID, groupID, targetUID string) error {
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

// exchangeOpenID 在 debug 模式生成模拟 openid，在 release 模式调用对应平台接口。
func (s *AuthService) exchangeOpenID(platform, code string) (string, error) {
	if code == "" {
		return "", errors.New("code 不能为空")
	}

	switch platform {
	case "wechat", "douyin":
	default:
		return "", fmt.Errorf("不支持的平台: %s", platform)
	}

	if s.cfg == nil || s.cfg.ServerMode != "release" {
		return platform + "_" + code, nil
	}

	switch platform {
	case "wechat":
		if s.cfg.WxAppID == "" || s.cfg.WxSecret == "" {
			return "", errors.New("release 模式缺少微信 WX_APPID 或 WX_SECRET")
		}
		return s.exchangeWechatOpenID(code)
	case "douyin":
		if s.cfg.DyAppID == "" || s.cfg.DySecret == "" {
			return "", errors.New("release 模式缺少抖音 DY_APPID 或 DY_SECRET")
		}
		return s.exchangeDouyinOpenID(code)
	default:
		return "", fmt.Errorf("不支持的平台: %s", platform)
	}
}

// exchangeWechatOpenID 调用微信 jscode2session，将前端 code 换成 openid。
func (s *AuthService) exchangeWechatOpenID(code string) (string, error) {
	endpoint, err := url.Parse(s.wxCode2SessionURL)
	if err != nil {
		return "", fmt.Errorf("微信 code2session 地址无效: %w", err)
	}
	q := endpoint.Query()
	q.Set("appid", s.cfg.WxAppID)
	q.Set("secret", s.cfg.WxSecret)
	q.Set("js_code", code)
	q.Set("grant_type", "authorization_code")
	endpoint.RawQuery = q.Encode()

	resp, err := s.client().Get(endpoint.String())
	if err != nil {
		return "", fmt.Errorf("调用微信 code2session 失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("微信 code2session HTTP 状态异常: %d", resp.StatusCode)
	}

	var payload struct {
		OpenID  string `json:"openid"`
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("解析微信 code2session 响应失败: %w", err)
	}
	if payload.ErrCode != 0 {
		return "", fmt.Errorf("微信 code2session 返回错误: %d %s", payload.ErrCode, payload.ErrMsg)
	}
	if payload.OpenID == "" {
		return "", errors.New("微信 code2session 未返回 openid")
	}
	return payload.OpenID, nil
}

// exchangeDouyinOpenID 调用抖音 code2session，将前端 code 换成 openid。
func (s *AuthService) exchangeDouyinOpenID(code string) (string, error) {
	body, err := json.Marshal(map[string]string{
		"appid":  s.cfg.DyAppID,
		"secret": s.cfg.DySecret,
		"code":   code,
	})
	if err != nil {
		return "", fmt.Errorf("构造抖音 code2session 请求失败: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, s.dyCode2SessionURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("抖音 code2session 地址无效: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("调用抖音 code2session 失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("抖音 code2session HTTP 状态异常: %d", resp.StatusCode)
	}

	var payload struct {
		ErrNo   int    `json:"err_no"`
		ErrTips string `json:"err_tips"`
		Data    struct {
			OpenID string `json:"openid"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("解析抖音 code2session 响应失败: %w", err)
	}
	if payload.ErrNo != 0 {
		return "", fmt.Errorf("抖音 code2session 返回错误: %d %s", payload.ErrNo, payload.ErrTips)
	}
	if payload.Data.OpenID == "" {
		return "", errors.New("抖音 code2session 未返回 openid")
	}
	return payload.Data.OpenID, nil
}

// client 返回可注入的 HTTP 客户端，测试未注入时回退默认客户端。
func (s *AuthService) client() *http.Client {
	if s.httpClient != nil {
		return s.httpClient
	}
	return http.DefaultClient
}

// generateJWT 使用 HS256 签发包含 uid、platform 和过期时间的登录令牌。
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

// getOpenIDField 将平台名映射到 users 表中的 openid 字段。
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

// coupleToProfile 将数据库模型转换为接口需要的情侣摘要。
func coupleToProfile(c *model.Couple) *CoupleProfile {
	if c == nil {
		return nil
	}
	return &CoupleProfile{
		ID:      c.ID,
		User1ID: c.User1ID,
		User2ID: c.User2ID,
		Status:  c.Status,
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
