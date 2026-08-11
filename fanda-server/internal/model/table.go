package model

import (
	"time"

	"github.com/google/uuid"
)

// Table 是统一餐桌模型，承载个人、情侣和饭搭餐桌的业务归属边界。
type Table struct {
	ID        uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Type      string        `gorm:"type:varchar(10);not null;index" json:"type"`
	Name      string        `gorm:"type:varchar(50);not null" json:"name"`
	OwnerID   uuid.UUID     `gorm:"type:uuid;not null;index" json:"owner_id"`
	Status    string        `gorm:"type:varchar(15);not null;default:'active'" json:"status"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
	Members   []TableMember `gorm:"foreignKey:TableID" json:"members,omitempty"`
}

// TableMember 是餐桌成员关系；所有餐桌访问权限均以 active 成员关系为准。
type TableMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TableID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_table_member_user" json:"table_id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_table_member_user;index" json:"user_id"`
	Role     string    `gorm:"type:varchar(10);not null;default:'member'" json:"role"`
	Status   string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"`
	JoinedAt time.Time `json:"joined_at"`
	User     User      `gorm:"foreignKey:UserID;references:UID" json:"user,omitempty"`
}

func (Table) TableName() string       { return "tables" }
func (TableMember) TableName() string { return "table_members" }
