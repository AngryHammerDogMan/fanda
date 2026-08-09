package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User 用户表
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

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.UID == uuid.Nil {
		u.UID = uuid.New()
	}
	return nil
}

// Couple 情侣关系表
type Couple struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	User1ID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_couple_user1" json:"user1_id"`
	User2ID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_couple_user2" json:"user2_id"`
	Status    string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"` // active / dissolved
	CreatedAt time.Time `json:"created_at"`
}

// CoupleInvite 情侣邀请码表
type CoupleInvite struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	InviterID uuid.UUID `gorm:"type:uuid;not null;index" json:"inviter_id"`
	Code      string    `gorm:"type:varchar(10);not null;uniqueIndex" json:"code"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	IsUsed    bool      `gorm:"default:false" json:"is_used"`
	CreatedAt time.Time `json:"created_at"`
}

// BuddyGroup 饭搭子组合表
type BuddyGroup struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string    `gorm:"type:varchar(50);not null" json:"name"`
	OwnerID   uuid.UUID `gorm:"type:uuid;not null;index" json:"owner_id"`
	MaxMember int       `gorm:"default:10" json:"max_member"`
	Status    string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// BuddyMember 饭搭子成员表
type BuddyMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID  uuid.UUID `gorm:"type:uuid;not null;index:idx_buddy_group" json:"group_id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_buddy_group_user" json:"user_id"`
	Role     string    `gorm:"type:varchar(10);not null;default:'member'" json:"role"` // owner / admin / member
	JoinedAt time.Time `json:"joined_at"`
}

// BuddyInvite 饭搭子邀请码表
type BuddyInvite struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GroupID   uuid.UUID `gorm:"type:uuid;not null;index" json:"group_id"`
	InviterID uuid.UUID `gorm:"type:uuid;not null" json:"inviter_id"`
	Code      string    `gorm:"type:varchar(10);not null;uniqueIndex" json:"code"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	IsUsed    bool      `gorm:"default:false" json:"is_used"`
	CreatedAt time.Time `json:"created_at"`
}

// CrossPlatformBind 跨平台绑定表
type CrossPlatformBind struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	BindCode  string    `gorm:"type:varchar(10);not null;uniqueIndex" json:"bind_code"`
	IsUsed    bool      `gorm:"default:false" json:"is_used"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

func (Couple) TableName() string           { return "couples" }
func (CoupleInvite) TableName() string     { return "couple_invites" }
func (BuddyGroup) TableName() string       { return "buddy_groups" }
func (BuddyMember) TableName() string      { return "buddy_members" }
func (BuddyInvite) TableName() string      { return "buddy_invites" }
func (CrossPlatformBind) TableName() string { return "cross_platform_binds" }