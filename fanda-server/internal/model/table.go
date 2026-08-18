package model

import (
	"time"

	"github.com/google/uuid"
)

// Table 是统一餐桌模型，承载个人、情侣和饭搭餐桌的业务归属边界。
type Table struct {
	ID        uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"` // 餐桌主键
	Type      string        `gorm:"type:varchar(10);not null;index" json:"type"`              // personal/couple/buddy
	Name      string        `gorm:"type:varchar(50);not null" json:"name"`                    // 展示名称
	OwnerID   uuid.UUID     `gorm:"type:uuid;not null;index" json:"owner_id"`                 // 餐桌创建者
	Status    string        `gorm:"type:varchar(15);not null;default:'active'" json:"status"` // active/dissolved 等状态
	CreatedAt time.Time     `json:"created_at"`                                               // 创建时间
	UpdatedAt time.Time     `json:"updated_at"`                                               // 更新时间
	Members   []TableMember `gorm:"foreignKey:TableID" json:"members,omitempty"`              // 活跃成员列表
}

// TableMember 是餐桌成员关系；所有餐桌访问权限均以 active 成员关系为准。
type TableMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`                  // 成员关系主键
	TableID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_table_member_user" json:"table_id"`      // 餐桌 ID
	UserID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_table_member_user;index" json:"user_id"` // 用户 ID
	Role     string    `gorm:"type:varchar(10);not null;default:'member'" json:"role"`                    // owner/admin/member
	Status   string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"`                  // active 表示可访问
	JoinedAt time.Time `json:"joined_at"`                                                                 // 加入时间
	User     User      `gorm:"foreignKey:UserID;references:UID" json:"user,omitempty"`                    // 预加载用户信息
}

func (Table) TableName() string       { return "tables" }
func (TableMember) TableName() string { return "table_members" }
