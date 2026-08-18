package model

import (
	"time"

	"github.com/google/uuid"
)

// WishItem 心愿清单表；由创建人维护完成/删除状态，餐桌成员可浏览。
type WishItem struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"` // 心愿主键
	UserID      uuid.UUID  `gorm:"type:uuid;not null;index:idx_wish_user" json:"user_id"`    // 创建人
	TableID     uuid.UUID  `gorm:"type:uuid;not null;index:idx_wish_table" json:"table_id"`  // 所属餐桌
	Name        string     `gorm:"type:varchar(100);not null" json:"name"`                   // 心愿名称
	Note        string     `gorm:"type:text" json:"note"`                                    // 备注
	DishID      *uuid.UUID `gorm:"type:uuid" json:"dish_id"`                                 // 可选关联菜品
	IsCompleted bool       `gorm:"default:false" json:"is_completed"`                        // 是否完成
	CreatedAt   time.Time  `json:"created_at"`                                               // 创建时间
}

func (WishItem) TableName() string { return "wish_items" }

// Checkin 签到记录表；同一用户同一天唯一，用于计算连续签到和积分奖励。
type Checkin struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`                 // 签到主键
	UserID      uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_checkin_user_date" json:"user_id"`      // 签到用户
	CheckinDate time.Time `gorm:"type:date;not null;uniqueIndex:idx_checkin_user_date" json:"checkin_date"` // 签到日期
	Points      int       `gorm:"default:1" json:"points"`                                                  // 本次奖励积分
	CreatedAt   time.Time `json:"created_at"`                                                               // 创建时间
}

func (Checkin) TableName() string { return "checkins" }

// PointRecord 积分历史表；记录积分来源，便于前端展示流水。
type PointRecord struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"` // 流水主键
	UserID    uuid.UUID `gorm:"type:uuid;not null;index" json:"user_id"`                  // 用户 ID
	Points    int       `gorm:"not null" json:"points"`                                   // 积分变化值
	Reason    string    `gorm:"type:varchar(50);not null" json:"reason"`                  // 积分来源
	CreatedAt time.Time `json:"created_at"`                                               // 创建时间
}

func (PointRecord) TableName() string { return "point_records" }

// BudgetSetting 预算设置表；同一用户、餐桌和月份唯一，支持按月覆盖预算。
type BudgetSetting struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`                                // 预算主键
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_budget_unique" json:"user_id"`                         // 设置预算的用户
	TableID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_budget_unique;index:idx_budget_table" json:"table_id"` // 所属餐桌
	Month     string    `gorm:"type:varchar(7);not null;uniqueIndex:idx_budget_unique" json:"month"`                     // 月份，格式 2026-08
	Budget    float64   `gorm:"type:decimal(10,2);not null" json:"budget"`                                               // 预算金额
	CreatedAt time.Time `json:"created_at"`                                                                              // 创建时间
	UpdatedAt time.Time `json:"updated_at"`                                                                              // 更新时间
}

func (BudgetSetting) TableName() string { return "budget_settings" }

// ShoppingBasket 菜篮子表；按餐桌共享采购项，购买状态由创建者维护。
type ShoppingBasket struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`  // 菜篮子项主键
	UserID      uuid.UUID `gorm:"type:uuid;not null;index:idx_basket_table" json:"user_id"`  // 创建人
	TableID     uuid.UUID `gorm:"type:uuid;not null;index:idx_basket_table" json:"table_id"` // 所属餐桌
	Name        string    `gorm:"type:varchar(100);not null" json:"name"`                    // 采购项名称
	Quantity    string    `gorm:"type:varchar(30);default:'1'" json:"quantity"`              // 采购数量描述
	IsPurchased bool      `gorm:"default:false" json:"is_purchased"`                         // 是否已购买
	CreatedAt   time.Time `json:"created_at"`                                                // 创建时间
}

func (ShoppingBasket) TableName() string { return "shopping_baskets" }
