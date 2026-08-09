package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Dish 菜品表
type Dish struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OwnerID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"owner_id"`
	GroupType      string         `gorm:"type:varchar(10);not null;index:idx_dish_group" json:"group_type"` // couple / buddy
	GroupID        uuid.UUID      `gorm:"type:uuid;not null;index:idx_dish_group" json:"group_id"`
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

// PlazaDish 学菜广场菜品表
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