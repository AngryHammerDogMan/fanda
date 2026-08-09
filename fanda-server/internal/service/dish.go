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

func NewDishService() *DishService {
	return &DishService{}
}

// CreateDish 创建菜品
func (s *DishService) CreateDish(ctx context.Context, uid uuid.UUID, req CreateDishReq) (*model.Dish, error) {
	dish := model.Dish{
		OwnerID:   uid,
		GroupType: req.GroupType,
		GroupID:   req.GroupID,
		DishType:  req.DishType,
		Name:      req.Name,
		Category:  req.Category,
		Duration:  req.Duration,
		Tags:      pq.StringArray(req.Tags),
		Restaurant: req.Restaurant,
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

// UpdateDish 更新菜品
func (s *DishService) UpdateDish(ctx context.Context, uid uuid.UUID, dishID uuid.UUID, req UpdateDishReq) error {
	var dish model.Dish
	if err := database.DB.Where("id = ? AND owner_id = ? AND is_deleted = false", dishID, uid).First(&dish).Error; err != nil {
		return errors.New("菜品不存在")
	}

	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Difficulty != nil {
		updates["difficulty"] = *req.Difficulty
	}
	if req.Duration > 0 {
		updates["duration"] = req.Duration
	}
	if req.Price != nil {
		updates["price"] = *req.Price
	}
	if req.Ingredients != nil {
		b, _ := json.Marshal(req.Ingredients)
		updates["ingredients"] = string(b)
	}
	if req.Steps != nil {
		b, _ := json.Marshal(req.Steps)
		updates["steps"] = string(b)
	}
	if req.Photos != nil {
		b, _ := json.Marshal(req.Photos)
		updates["photos"] = string(b)
	}
	if req.Tags != nil {
		updates["tags"] = pq.StringArray(req.Tags)
	}
	if req.Restaurant != "" {
		updates["restaurant"] = req.Restaurant
	}
	if req.RestaurantNote != "" {
		updates["restaurant_note"] = req.RestaurantNote
	}

	if len(updates) == 0 {
		return errors.New("没有需要更新的字段")
	}

	return database.DB.Model(&dish).Updates(updates).Error
}

// DeleteDish 软删除菜品
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
func (s *DishService) GetDish(ctx context.Context, dishID uuid.UUID) (*model.Dish, error) {
	var dish model.Dish
	if err := database.DB.Where("id = ? AND is_deleted = false", dishID).First(&dish).Error; err != nil {
		return nil, errors.New("菜品不存在")
	}
	return &dish, nil
}

// ListDishes 获取菜品列表
func (s *DishService) ListDishes(ctx context.Context, groupType string, groupID uuid.UUID, dishType, category, keyword string, page, pageSize int) ([]model.Dish, int64, error) {
	var dishes []model.Dish
	var total int64

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

// ImportFromPlaza 从学菜广场导入菜品
func (s *DishService) ImportFromPlaza(ctx context.Context, uid uuid.UUID, plazaID uuid.UUID, groupType string, groupID uuid.UUID) (*model.Dish, error) {
	var plaza model.PlazaDish
	if err := database.DB.First(&plaza, "id = ?", plazaID).Error; err != nil {
		return nil, errors.New("学菜广场菜品不存在")
	}

	dish := model.Dish{
		OwnerID:   uid,
		GroupType: groupType,
		GroupID:   groupID,
		DishType:  "dish",
		Name:      plaza.Name,
		Category:  plaza.Category,
		Difficulty: plaza.Difficulty,
		Duration:  plaza.Duration,
		Ingredients: plaza.Ingredients,
		Steps:      plaza.Steps,
		Photos:     plaza.Photos,
		Tags:       plaza.Tags,
		Source:     "plaza",
	}

	if err := database.DB.Create(&dish).Error; err != nil {
		return nil, fmt.Errorf("导入菜品失败: %w", err)
	}

	// 增加导入计数
	database.DB.Model(&plaza).UpdateColumn("import_count", plaza.ImportCount+1)

	return &dish, nil
}

// SearchPlaza 搜索学菜广场
func (s *DishService) SearchPlaza(ctx context.Context, category, keyword string, page, pageSize int) ([]model.PlazaDish, int64, error) {
	var dishes []model.PlazaDish
	var total int64

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

// ---- 请求结构 ----

type CreateDishReq struct {
	GroupType      string        `json:"group_type" binding:"required,oneof=couple buddy"`
	GroupID        uuid.UUID     `json:"group_id" binding:"required"`
	DishType       string        `json:"dish_type" binding:"required,oneof=dish takeout dineout"`
	Name           string        `json:"name" binding:"required,max=100"`
	Category       string        `json:"category"`
	Difficulty     *int          `json:"difficulty"`
	Duration       int           `json:"duration"`
	Price          *float64      `json:"price"`
	Ingredients    interface{}   `json:"ingredients"`
	Steps          interface{}   `json:"steps"`
	Photos         interface{}   `json:"photos"`
	Tags           []string      `json:"tags"`
	Restaurant     string        `json:"restaurant"`
	RestaurantNote string        `json:"restaurant_note"`
}

type UpdateDishReq struct {
	Name           string      `json:"name"`
	Category       string      `json:"category"`
	Difficulty     *int        `json:"difficulty"`
	Duration       int         `json:"duration"`
	Price          *float64    `json:"price"`
	Ingredients    interface{} `json:"ingredients"`
	Steps          interface{} `json:"steps"`
	Photos         interface{} `json:"photos"`
	Tags           []string    `json:"tags"`
	Restaurant     string      `json:"restaurant"`
	RestaurantNote string      `json:"restaurant_note"`
}