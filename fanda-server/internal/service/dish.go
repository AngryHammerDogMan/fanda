package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type DishService struct{}

// NewDishService 创建菜品服务，所有数据访问通过 database.DB 完成。
func NewDishService() *DishService {
	return &DishService{}
}

// CreateDish 创建菜品：先校验用户是否属于目标组合，再把复杂字段序列化为 JSONB 字符串保存。
func (s *DishService) CreateDish(ctx context.Context, uid uuid.UUID, req CreateDishReq) (*model.Dish, error) {
	if err := CanAccessGroup(ctx, uid, req.GroupType, req.GroupID); err != nil {
		return nil, err
	}

	dish := model.Dish{
		OwnerID:        uid,
		GroupType:      req.GroupType,
		GroupID:        req.GroupID,
		DishType:       req.DishType,
		Name:           req.Name,
		Category:       req.Category,
		Duration:       req.Duration,
		Tags:           pq.StringArray(req.Tags),
		Restaurant:     req.Restaurant,
		RestaurantNote: req.RestaurantNote,
	}

	if req.Difficulty != nil {
		dish.Difficulty = req.Difficulty
	}
	if req.Price != nil {
		dish.Price = req.Price
	}
	if req.Ingredients != nil {
		b, _ := json.Marshal(req.Ingredients)
		dish.Ingredients = string(b)
	}
	if req.Steps != nil {
		b, _ := json.Marshal(req.Steps)
		dish.Steps = string(b)
	}
	if req.Photos != nil {
		b, _ := json.Marshal(req.Photos)
		dish.Photos = string(b)
	}

	if err := database.DB.Create(&dish).Error; err != nil {
		return nil, fmt.Errorf("创建菜品失败: %w", err)
	}
	return &dish, nil
}

// UpdateDish 更新菜品：只允许创建者修改未删除菜品，并只写入请求中显式提供的字段。
func (s *DishService) UpdateDish(ctx context.Context, uid uuid.UUID, dishID uuid.UUID, req UpdateDishReq) error {
	var dish model.Dish
	if err := database.DB.Where("id = ? AND owner_id = ? AND is_deleted = false", dishID, uid).First(&dish).Error; err != nil {
		return errors.New("菜品不存在")
	}

	tx := database.DB.Begin()
	updated := false
	if req.Name != "" {
		if err := tx.Model(&dish).Update("name", req.Name).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Category != "" {
		if err := tx.Model(&dish).Update("category", req.Category).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Difficulty != nil {
		if err := tx.Model(&dish).Update("difficulty", *req.Difficulty).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Duration > 0 {
		if err := tx.Model(&dish).Update("duration", req.Duration).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Price != nil {
		if err := tx.Model(&dish).Update("price", *req.Price).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Ingredients != nil {
		b, _ := json.Marshal(req.Ingredients)
		if err := tx.Model(&dish).Update("ingredients", string(b)).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Steps != nil {
		b, _ := json.Marshal(req.Steps)
		if err := tx.Model(&dish).Update("steps", string(b)).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Photos != nil {
		b, _ := json.Marshal(req.Photos)
		if err := tx.Model(&dish).Update("photos", string(b)).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Tags != nil {
		if err := tx.Model(&dish).Update("tags", pq.StringArray(req.Tags)).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.Restaurant != "" {
		if err := tx.Model(&dish).Update("restaurant", req.Restaurant).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}
	if req.RestaurantNote != "" {
		if err := tx.Model(&dish).Update("restaurant_note", req.RestaurantNote).Error; err != nil {
			tx.Rollback()
			return err
		}
		updated = true
	}

	if !updated {
		tx.Rollback()
		return errors.New("没有需要更新的字段")
	}

	return tx.Commit().Error
}

// DeleteDish 软删除菜品：保留历史订单/记录引用，仅把 is_deleted 置为 true。
func (s *DishService) DeleteDish(ctx context.Context, uid uuid.UUID, dishID uuid.UUID) error {
	result := database.DB.Model(&model.Dish{}).
		Where("id = ? AND owner_id = ? AND is_deleted = false", dishID, uid).
		Update("is_deleted", true)
	if result.RowsAffected == 0 {
		return errors.New("菜品不存在")
	}
	return result.Error
}

// GetDish 获取菜品详情
func (s *DishService) GetDish(ctx context.Context, uid uuid.UUID, dishID uuid.UUID) (*model.Dish, error) {
	dish, err := CanAccessDish(ctx, uid, dishID)
	if err != nil {
		return nil, errors.New("菜品不存在")
	}
	return dish, nil
}

// ListDishes 获取菜品列表：组合鉴权后拼接筛选条件，先 Count 再按分页读取列表。
func (s *DishService) ListDishes(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID, dishType, category, keyword string, page, pageSize int) ([]model.Dish, int64, error) {
	var dishes []model.Dish
	var total int64
	page, pageSize = NormalizePagination(page, pageSize)

	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, 0, err
	}

	query := database.DB.Model(&model.Dish{}).
		Where("group_type = ? AND group_id = ? AND is_deleted = false", groupType, groupID)

	if dishType != "" {
		query = query.Where("dish_type = ?", dishType)
	}
	if category != "" {
		query = query.Where("category = ?", category)
	}
	if keyword != "" {
		query = query.Where("name ILIKE ? OR restaurant ILIKE ?", "%"+keyword+"%", "%"+keyword+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&dishes).Error; err != nil {
		return nil, 0, err
	}

	return dishes, total, nil
}

// ImportFromPlaza 从学菜广场导入菜品：复制广场菜品快照到目标组合并增加导入计数。
func (s *DishService) ImportFromPlaza(ctx context.Context, uid uuid.UUID, plazaID uuid.UUID, groupType string, groupID uuid.UUID) (*model.Dish, error) {
	if err := CanAccessGroup(ctx, uid, groupType, groupID); err != nil {
		return nil, err
	}

	var plaza model.PlazaDish
	if err := database.DB.First(&plaza, "id = ?", plazaID).Error; err != nil {
		return nil, errors.New("学菜广场菜品不存在")
	}

	dish := model.Dish{
		OwnerID:     uid,
		GroupType:   groupType,
		GroupID:     groupID,
		DishType:    "dish",
		Name:        plaza.Name,
		Category:    plaza.Category,
		Difficulty:  plaza.Difficulty,
		Duration:    plaza.Duration,
		Ingredients: plaza.Ingredients,
		Steps:       plaza.Steps,
		Photos:      plaza.Photos,
		Tags:        plaza.Tags,
		Source:      "plaza",
	}

	if err := database.DB.Create(&dish).Error; err != nil {
		return nil, fmt.Errorf("导入菜品失败: %w", err)
	}

	// 增加导入计数
	database.DB.Model(&plaza).UpdateColumn("import_count", plaza.ImportCount+1)

	return &dish, nil
}

// SearchPlaza 搜索学菜广场：按导入热度和创建时间排序，适配前端瀑布流分页。
func (s *DishService) SearchPlaza(ctx context.Context, category, keyword string, page, pageSize int) ([]model.PlazaDish, int64, error) {
	var dishes []model.PlazaDish
	var total int64
	page, pageSize = NormalizePagination(page, pageSize)

	query := database.DB.Model(&model.PlazaDish{})
	if category != "" {
		query = query.Where("category = ?", category)
	}
	if keyword != "" {
		query = query.Where("name ILIKE ?", "%"+keyword+"%")
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	offset := (page - 1) * pageSize
	if err := query.Order("import_count DESC, created_at DESC").Offset(offset).Limit(pageSize).Find(&dishes).Error; err != nil {
		return nil, 0, err
	}

	return dishes, total, nil
}

// GetPlazaCategories 获取学菜广场分类列表
func (s *DishService) GetPlazaCategories(ctx context.Context) ([]string, error) {
	// 预设分类
	preset := []string{"家常菜", "川菜", "粤菜", "湘菜", "鲁菜", "西餐", "日料", "韩餐", "甜品", "汤羹", "小吃", "面食", "快手菜", "减脂餐"}
	return preset, nil
}

// ---- 请求结构：字段标签同时服务于 Gin 参数绑定和接口文档阅读 ----

type IngredientReq struct {
	Name   string `json:"name"`
	Amount string `json:"amount"`
}

type StepReq struct {
	Order       int    `json:"order"`
	Description string `json:"description"`
	Image       string `json:"image,omitempty"`
}

type CreateDishReq struct {
	GroupType      string          `json:"group_type" binding:"required,oneof=couple buddy"`
	GroupID        uuid.UUID       `json:"group_id" binding:"required"`
	DishType       string          `json:"dish_type" binding:"required,oneof=dish takeout dineout"`
	Name           string          `json:"name" binding:"required,max=100"`
	Category       string          `json:"category"`
	Difficulty     *int            `json:"difficulty"`
	Duration       int             `json:"duration"`
	Price          *float64        `json:"price"`
	Ingredients    []IngredientReq `json:"ingredients"`
	Steps          []StepReq       `json:"steps"`
	Photos         []string        `json:"photos"`
	Tags           []string        `json:"tags"`
	Restaurant     string          `json:"restaurant"`
	RestaurantNote string          `json:"restaurant_note"`
}

type UpdateDishReq struct {
	Name           string          `json:"name"`
	Category       string          `json:"category"`
	Difficulty     *int            `json:"difficulty"`
	Duration       int             `json:"duration"`
	Price          *float64        `json:"price"`
	Ingredients    []IngredientReq `json:"ingredients"`
	Steps          []StepReq       `json:"steps"`
	Photos         []string        `json:"photos"`
	Tags           []string        `json:"tags"`
	Restaurant     string          `json:"restaurant"`
	RestaurantNote string          `json:"restaurant_note"`
}
