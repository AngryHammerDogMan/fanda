package handler

import (
	"net/http"
	"strconv"
	"time"

	"fanda-server/internal/config"
	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type AdminHandler struct {
	cfg *config.Config
}

// NewAdminHandler 创建后台管理 handler，后台接口只依赖配置和数据库。
func NewAdminHandler(cfg *config.Config) *AdminHandler {
	return &AdminHandler{cfg: cfg}
}

// AdminLogin 管理员登录：body.password 与配置中的后台密码匹配后签发 role=admin 的 JWT。
func (h *AdminHandler) AdminLogin(c *gin.Context) {
	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "请输入密码"})
		return
	}

	adminPass := h.cfg.AdminPassword
	if adminPass == "" {
		adminPass = "admin123"
	}

	if req.Password != adminPass {
		c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "密码错误"})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"role": "admin",
		"exp":  time.Now().Add(24 * time.Hour).Unix(),
		"iat":  time.Now().Unix(),
	})
	tokenStr, err := token.SignedString([]byte(h.cfg.JWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": "生成管理员令牌失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": gin.H{"token": tokenStr}})
}

// GetStats 仪表盘统计：汇总全站总量、今日增量和本月消费，供后台首页展示。
func (h *AdminHandler) GetStats(c *gin.Context) {
	var totalUsers, totalDishes, totalOrders, totalRecords int64
	database.DB.Model(&model.User{}).Count(&totalUsers)
	database.DB.Model(&model.Dish{}).Where("is_deleted = false").Count(&totalDishes)
	database.DB.Model(&model.Order{}).Count(&totalOrders)
	database.DB.Model(&model.CalendarRecord{}).Count(&totalRecords)

	var totalBudget float64
	database.DB.Model(&model.CalendarRecord{}).Select("COALESCE(SUM(amount), 0)").Row().Scan(&totalBudget)

	// 今日新增用户
	var todayUsers int64
	today := time.Now().Format("2006-01-02")
	database.DB.Model(&model.User{}).Where("created_at >= ?", today).Count(&todayUsers)

	// 今日新增菜品
	var todayDishes int64
	database.DB.Model(&model.Dish{}).Where("is_deleted = false AND created_at >= ?", today).Count(&todayDishes)

	// 今日订单
	var todayOrders int64
	database.DB.Model(&model.Order{}).Where("created_at >= ?", today).Count(&todayOrders)

	// 本月消费
	var monthBudget float64
	monthStart := time.Now().Format("2006-01") + "-01"
	database.DB.Model(&model.CalendarRecord{}).Where("record_date >= ?", monthStart).Select("COALESCE(SUM(amount), 0)").Row().Scan(&monthBudget)

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": gin.H{
		"total_users":   totalUsers,
		"total_dishes":  totalDishes,
		"total_orders":  totalOrders,
		"total_records": totalRecords,
		"total_budget":  totalBudget,
		"today_users":   todayUsers,
		"today_dishes":  todayDishes,
		"today_orders":  todayOrders,
		"month_budget":  monthBudget,
	}})
}

// ListUsers 用户列表：支持 page/page_size 分页和昵称/手机号关键词搜索。
func (h *AdminHandler) ListUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	keyword := c.Query("keyword")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.User{})
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("nickname ILIKE ? OR phone ILIKE ?", like, like)
	}

	var total int64
	query.Count(&total)

	var users []model.User
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&users)

	type UserItem struct {
		UID       string    `json:"uid"`
		Nickname  string    `json:"nickname"`
		Phone     string    `json:"phone"`
		HasWx     bool      `json:"has_wx"`
		HasDy     bool      `json:"has_dy"`
		Points    int       `json:"points"`
		CreatedAt time.Time `json:"created_at"`
	}

	result := make([]UserItem, len(users))
	for i, u := range users {
		phone := ""
		if u.Phone != nil {
			phone = *u.Phone
		}
		result[i] = UserItem{
			UID:       u.UID.String(),
			Nickname:  u.Nickname,
			Phone:     phone,
			HasWx:     u.WxOpenID != nil,
			HasDy:     u.DyOpenID != nil,
			Points:    u.Points,
			CreatedAt: u.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":      result,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// ListDishes 菜品列表：仅返回未软删除菜品，支持关键词、类型和分页。
func (h *AdminHandler) ListDishes(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	keyword := c.Query("keyword")
	dishType := c.Query("dish_type")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Dish{}).Where("is_deleted = false")
	if keyword != "" {
		like := "%" + keyword + "%"
		query = query.Where("name ILIKE ? OR restaurant ILIKE ?", like, like)
	}
	if dishType != "" {
		query = query.Where("dish_type = ?", dishType)
	}

	var total int64
	query.Count(&total)

	var dishes []model.Dish
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&dishes)

	type DishItem struct {
		ID        string    `json:"id"`
		Name      string    `json:"name"`
		DishType  string    `json:"dish_type"`
		TableID   string    `json:"table_id"`
		Price     float64   `json:"price"`
		CreatedAt time.Time `json:"created_at"`
	}

	result := make([]DishItem, len(dishes))
	for i, d := range dishes {
		price := float64(0)
		if d.Price != nil {
			price = *d.Price
		}
		result[i] = DishItem{
			ID:        d.ID.String(),
			Name:      d.Name,
			DishType:  d.DishType,
			TableID:   d.TableID.String(),
			Price:     price,
			CreatedAt: d.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":      result,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// DeleteDish 删除菜品：后台按路径 id 执行软删除，用于管理违规或无效数据。
func (h *AdminHandler) DeleteDish(c *gin.Context) {
	id := c.Param("id")
	database.DB.Model(&model.Dish{}).Where("id = ?", id).Update("is_deleted", true)
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "删除成功"})
}

// ListOrders 订单列表：支持按订单状态过滤并分页返回后台展示字段。
func (h *AdminHandler) ListOrders(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	status := c.Query("status")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.Order{})
	if status != "" {
		query = query.Where("status = ?", status)
	}

	var total int64
	query.Count(&total)

	var orders []model.Order
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&orders)

	type OrderItem struct {
		ID          string    `json:"id"`
		TableID     string    `json:"table_id"`
		DineMode    string    `json:"dine_mode"`
		Status      string    `json:"status"`
		TotalAmount float64   `json:"total_amount"`
		CreatedAt   time.Time `json:"created_at"`
	}

	result := make([]OrderItem, len(orders))
	for i, o := range orders {
		amt := float64(0)
		if o.TotalAmount != nil {
			amt = *o.TotalAmount
		}
		result[i] = OrderItem{
			ID:          o.ID.String(),
			TableID:     o.TableID.String(),
			DineMode:    o.DineMode,
			Status:      o.Status,
			TotalAmount: amt,
			CreatedAt:   o.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":      result,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// ListRecords 日历记录列表：支持按餐型过滤并分页返回后台展示字段。
func (h *AdminHandler) ListRecords(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	mealType := c.Query("meal_type")

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	query := database.DB.Model(&model.CalendarRecord{})
	if mealType != "" {
		query = query.Where("meal_type = ?", mealType)
	}

	var total int64
	query.Count(&total)

	var records []model.CalendarRecord
	query.Order("created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&records)

	type RecordItem struct {
		ID         string    `json:"id"`
		TableID    string    `json:"table_id"`
		MealType   string    `json:"meal_type"`
		RecordDate string    `json:"record_date"`
		Amount     float64   `json:"amount"`
		CreatedAt  time.Time `json:"created_at"`
	}

	result := make([]RecordItem, len(records))
	for i, r := range records {
		amt := float64(0)
		if r.Amount != nil {
			amt = *r.Amount
		}
		result[i] = RecordItem{
			ID:         r.ID.String(),
			TableID:    r.TableID.String(),
			MealType:   r.MealType,
			RecordDate: r.RecordDate.Format("2006-01-02"),
			Amount:     amt,
			CreatedAt:  r.CreatedAt,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"code": 0,
		"data": gin.H{
			"list":      result,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}
