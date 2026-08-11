package model

import (
	"time"

	"github.com/google/uuid"
)

// WishItem 心愿清单表；由创建人维护完成/删除状态，餐桌成员可浏览。
type WishItem struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index:idx_wish_user" json:"user_id"`
	TableID     uuid.UUID  `gorm:"type:uuid;not null;index:idx_wish_table" json:"table_id"`
	Name        string     `gorm:"type:varchar(100);not null" json:"name"`
	Note        string     `gorm:"type:text" json:"note"`
	DishID      *uuid.UUID `gorm:"type:uuid" json:"dish_id"`
	IsCompleted bool       `gorm:"default:false" json:"is_completed"`
	CreatedAt   time.Time  `json:"created_at"`
}

func (WishItem) TableName() string { return "wish_items" }

// Checkin 签到记录表；同一用户同一天唯一，用于计算连续签到和积分奖励。
type Checkin struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_checkin_user_date" json:"user_id"`
	CheckinDate time.Time `gorm:"type:date;not null;uniqueIndex:idx_checkin_user_date" json:"checkin_date"`
	Points      int       `gorm:"default:1" json:"points"`
	CreatedAt   time.Time `json:"created_at"`
}

func (Checkin) TableName() string { return "checkins" }

// PointRecord 积分历史表；记录积分来源，便于前端展示流水。
type PointRecord struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`
	Points    int       `gorm:"not null" json:"points"`
	Reason    string    `gorm:"type:varchar(50);not null" json:"reason"`
	CreatedAt time.Time `json:"created_at"`
}

func (PointRecord) TableName() string { return "point_records" }

// BudgetSetting 预算设置表；同一用户、餐桌和月份唯一，支持按月覆盖预算。
type BudgetSetting struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_budget_unique" json:"user_id"`
	TableID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_budget_unique;index:idx_budget_table" json:"table_id"`
	Month     string    `gorm:"type:varchar(7);not null;uniqueIndex:idx_budget_unique" json:"month"` // 格式: 2026-08
	Budget    float64   `gorm:"type:decimal(10,2);not null" json:"budget"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (BudgetSetting) TableName() string { return "budget_settings" }

// ShoppingBasket 菜篮子表；按餐桌共享采购项，购买状态由创建者维护。
type ShoppingBasket struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID      uuid.UUID `gorm:"type:uuid;not null;index:idx_basket_table" json:"user_id"`
	TableID     uuid.UUID `gorm:"type:uuid;not null;index:idx_basket_table" json:"table_id"`
	Name        string    `gorm:"type:varchar(100);not null" json:"name"`
	Quantity    string    `gorm:"type:varchar(30);default:'1'" json:"quantity"`
	IsPurchased bool      `gorm:"default:false" json:"is_purchased"`
	CreatedAt   time.Time `json:"created_at"`
}

func (ShoppingBasket) TableName() string { return "shopping_baskets" }
