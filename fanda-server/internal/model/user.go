// Package model 定义数据库表结构和 JSON 序列化字段，供 GORM 自动映射。
package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User 用户表；微信 openid、抖音 openid 和手机号均为唯一标识，手机号用于跨平台账号合并。
type User struct {
	UID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"uid"`
	WxOpenID  *string   `gorm:"column:wx_openid;type:varchar(64);uniqueIndex" json:"wx_openid,omitempty"`
	DyOpenID  *string   `gorm:"column:dy_openid;type:varchar(64);uniqueIndex" json:"dy_openid,omitempty"`
	Phone     *string   `gorm:"column:phone;type:varchar(20);uniqueIndex" json:"phone,omitempty"`
	Nickname  string    `gorm:"type:varchar(50);not null" json:"nickname"`
	Avatar    string    `gorm:"type:varchar(500)" json:"avatar"`
	Points    int       `gorm:"default:0" json:"points"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BeforeCreate 兼容不支持数据库侧 gen_random_uuid 的测试环境，确保新用户始终有 UID。
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.UID == uuid.Nil {
		u.UID = uuid.New()
	}
	return nil
}

// Couple 情侣关系表；active 表示当前有效关系，鉴权会校验双方任一成员身份。
type Couple struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	User1ID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_couple_user1" json:"user1_id"`
	User2ID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_couple_user2" json:"user2_id"`
	Status    string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"` // active / dissolved
	CreatedAt time.Time `json:"created_at"`
}

// CoupleMember 将情侣双方规范化为行，跨 user1_id/user2_id 保证每个用户至多属于一段 active 关系。
type CoupleMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CoupleID uuid.UUID `gorm:"type:uuid;not null;index" json:"couple_id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Status   string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"`
}

// CoupleInvite 情侣邀请码表；邀请码有过期和使用状态，用于一次性建立情侣关系。
type CoupleInvite struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	InviterID uuid.UUID `gorm:"type:uuid;not null;index" json:"inviter_id"`
	Code      string    `gorm:"type:varchar(10);not null;uniqueIndex" json:"code"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	IsUsed    bool      `gorm:"default:false" json:"is_used"`
	CreatedAt time.Time `json:"created_at"`
}

// BuddyGroup 饭搭子组合表；owner_id 与 buddy_members 共同描述群主和成员关系。
type BuddyGroup struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string    `gorm:"type:varchar(50);not null" json:"name"`
	OwnerID   uuid.UUID `gorm:"type:uuid;not null;index" json:"owner_id"`
	MaxMember int       `gorm:"default:10" json:"max_member"`
	Status    string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BuddyMember 饭搭子成员表；group_id + user_id 唯一，避免同一用户重复入群。
type BuddyMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID  uuid.UUID `gorm:"type:uuid;not null;index:idx_buddy_group" json:"group_id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_buddy_group_user" json:"user_id"`
	Role     string    `gorm:"type:varchar(10);not null;default:'member'" json:"role"` // owner / admin / member
	JoinedAt time.Time `json:"joined_at"`
}

// BuddyInvite 饭搭子邀请码表；邀请人必须是对应饭搭子组合的 owner/admin。
type BuddyInvite struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID   uuid.UUID `gorm:"type:uuid;not null;index" json:"group_id"`
	InviterID uuid.UUID `gorm:"type:uuid;not null" json:"inviter_id"`
	Code      string    `gorm:"type:varchar(10);not null;uniqueIndex" json:"code"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	IsUsed    bool      `gorm:"default:false" json:"is_used"`
	CreatedAt time.Time `json:"created_at"`
}

func (Couple) TableName() string       { return "couples" }
func (CoupleMember) TableName() string { return "couple_members" }
func (CoupleInvite) TableName() string { return "couple_invites" }
func (BuddyGroup) TableName() string   { return "buddy_groups" }
func (BuddyMember) TableName() string  { return "buddy_members" }
func (BuddyInvite) TableName() string  { return "buddy_invites" }
