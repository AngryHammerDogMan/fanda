package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Dish 菜品表；同时承载自做菜、外卖和堂食条目，按 table_id 归属到餐桌。
type Dish struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OwnerID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"owner_id"`
	TableID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"table_id"`
	DishType       string         `gorm:"type:varchar(10);not null" json:"dish_type"` // dish / takeout / dineout
	Name           string         `gorm:"type:varchar(100);not null" json:"name"`
	Category       string         `gorm:"type:varchar(30)" json:"category"`
	Difficulty     *int           `gorm:"type:smallint" json:"difficulty"`
	Duration       int            `json:"duration"`
	Price          *float64       `gorm:"type:decimal(10,2)" json:"price"`
	Ingredients    string         `gorm:"type:jsonb" json:"ingredients"`
	Steps          string         `gorm:"type:jsonb" json:"steps"`
	Photos         string         `gorm:"type:jsonb" json:"photos"`
	Tags           pq.StringArray `gorm:"type:text[]" json:"tags"`
	Restaurant     string         `gorm:"type:varchar(100)" json:"restaurant"`
	RestaurantNote string         `gorm:"type:text" json:"restaurant_note"`
	Source         string         `gorm:"type:varchar(10);default:'manual'" json:"source"` // manual / plaza
	IsDeleted      bool           `gorm:"default:false" json:"is_deleted"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
}

func (Dish) TableName() string { return "dishes" }

// PlazaDish 学菜广场菜品表；作为可导入模板存在，导入后会复制为用户自己的 Dish。
type PlazaDish struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string         `gorm:"type:varchar(100);not null" json:"name"`
	Category    string         `gorm:"type:varchar(30)" json:"category"`
	Difficulty  *int           `gorm:"type:smallint" json:"difficulty"`
	Duration    int            `json:"duration"`
	Ingredients string         `gorm:"type:jsonb" json:"ingredients"`
	Steps       string         `gorm:"type:jsonb" json:"steps"`
	Photos      string         `gorm:"type:jsonb" json:"photos"`
	Tags        pq.StringArray `gorm:"type:text[]" json:"tags"`
	ImportCount int            `gorm:"default:0" json:"import_count"`
	CreatedAt   time.Time      `json:"created_at"`
}

func (PlazaDish) TableName() string { return "plaza_dishes" }
