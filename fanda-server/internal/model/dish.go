package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Dish 菜品表；同时承载自做菜、外卖和堂食条目，按 table_id 归属到餐桌。
type Dish struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"` // 菜品主键
	OwnerID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"owner_id"`                 // 创建人
	TableID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"table_id"`                 // 所属餐桌
	DishType       string         `gorm:"type:varchar(10);not null" json:"dish_type"`               // dish/takeout/dineout
	Name           string         `gorm:"type:varchar(100);not null" json:"name"`                   // 菜品名称
	Category       string         `gorm:"type:varchar(30)" json:"category"`                         // 分类
	Difficulty     *int           `gorm:"type:smallint" json:"difficulty"`                          // 难度 1-4
	Duration       int            `json:"duration"`                                                 // 预计耗时分钟
	Price          *float64       `gorm:"type:decimal(10,2)" json:"price"`                          // 价格
	Ingredients    string         `gorm:"type:jsonb" json:"ingredients"`                            // 食材 JSON
	Steps          string         `gorm:"type:jsonb" json:"steps"`                                  // 步骤 JSON
	Photos         string         `gorm:"type:jsonb" json:"photos"`                                 // 图片 JSON
	Tags           pq.StringArray `gorm:"type:text[]" json:"tags"`                                  // 标签
	Restaurant     string         `gorm:"type:varchar(100)" json:"restaurant"`                      // 餐厅
	RestaurantNote string         `gorm:"type:text" json:"restaurant_note"`                         // 餐厅备注
	Source         string         `gorm:"type:varchar(10);default:'manual'" json:"source"`          // manual/plaza
	IsDeleted      bool           `gorm:"default:false" json:"is_deleted"`                          // 软删除标记
	CreatedAt      time.Time      `json:"created_at"`                                               // 创建时间
	UpdatedAt      time.Time      `json:"updated_at"`                                               // 更新时间
}

func (Dish) TableName() string { return "dishes" }

// PlazaDish 学菜广场菜品表；作为可导入模板存在，导入后会复制为用户自己的 Dish。
type PlazaDish struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"` // 广场菜品主键
	Name        string         `gorm:"type:varchar(100);not null" json:"name"`                   // 菜名
	Category    string         `gorm:"type:varchar(30)" json:"category"`                         // 分类
	Difficulty  *int           `gorm:"type:smallint" json:"difficulty"`                          // 难度
	Duration    int            `json:"duration"`                                                 // 耗时分钟
	Ingredients string         `gorm:"type:jsonb" json:"ingredients"`                            // 食材 JSON
	Steps       string         `gorm:"type:jsonb" json:"steps"`                                  // 步骤 JSON
	Photos      string         `gorm:"type:jsonb" json:"photos"`                                 // 图片 JSON
	Tags        pq.StringArray `gorm:"type:text[]" json:"tags"`                                  // 标签
	ImportCount int            `gorm:"default:0" json:"import_count"`                            // 被导入次数
	CreatedAt   time.Time      `json:"created_at"`                                               // 创建时间
}

func (PlazaDish) TableName() string { return "plaza_dishes" }
