package router

import (
	"fanda-server/internal/config"
	"fanda-server/internal/handler"
	"fanda-server/internal/middleware"

	"github.com/gin-gonic/gin"
)

func Setup(cfg *config.Config) *gin.Engine {
	gin.SetMode(cfg.ServerMode)

	r := gin.New()
	r.Use(middleware.Logger())
	r.Use(middleware.CORS())
	r.Use(gin.Recovery())

	// 静态文件（上传目录）
	r.Static("/uploads", cfg.UploadDir)
	// 后台管理页面
	r.Static("/admin", "./static/admin")

	authHandler := handler.NewAuthHandler(cfg)
	dishHandler := handler.NewDishHandler()
	orderHandler := handler.NewOrderHandler()
	calendarHandler := handler.NewCalendarHandler()
	featureHandler := handler.NewFeatureHandler()
	adminHandler := handler.NewAdminHandler(cfg)

	// 首页
	r.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})

	api := r.Group("/api/v1")
	{
		// ============ 公开接口（无需认证）============
		auth := api.Group("/auth")
		{
			auth.POST("/login", authHandler.Login)
			auth.POST("/login/phone", authHandler.LoginByPhone)
		}

		// ============ 后台管理 ============
		admin := api.Group("/admin")
		{
			admin.POST("/login", adminHandler.AdminLogin)
		}
		adminAuth := api.Group("/admin")
		adminAuth.Use(middleware.AdminMiddleware(cfg))
		{
			adminAuth.GET("/stats", adminHandler.GetStats)
			adminAuth.GET("/users", adminHandler.ListUsers)
			adminAuth.GET("/dishes", adminHandler.ListDishes)
			adminAuth.DELETE("/dishes/:id", adminHandler.DeleteDish)
			adminAuth.GET("/orders", adminHandler.ListOrders)
			adminAuth.GET("/records", adminHandler.ListRecords)
		}

		// ============ 需要认证的接口 ============
		protected := api.Group("")
		protected.Use(middleware.AuthMiddleware(cfg))
		{
			// 用户认证
			authGroup := protected.Group("/auth")
			{
				authGroup.POST("/bind-code", authHandler.GenerateBindCode)
				authGroup.POST("/bind", authHandler.BindPlatform)
				authGroup.POST("/bind-phone", authHandler.BindPhone)
				authGroup.GET("/profile", authHandler.GetProfile)
				authGroup.PUT("/profile", authHandler.UpdateProfile)
			}

			// 情侣关系
			couple := protected.Group("/couple")
			{
				couple.POST("/invite", authHandler.CreateCoupleInvite)
				couple.POST("/join", authHandler.JoinCouple)
			}

			// 饭搭子组合
			buddy := protected.Group("/buddy")
			{
				buddy.POST("/groups", authHandler.CreateBuddyGroup)
				buddy.POST("/groups/:id/invite", authHandler.CreateBuddyInvite)
				buddy.POST("/groups/:id/join", authHandler.JoinBuddyGroup)
				buddy.DELETE("/groups/:id/members/:uid", authHandler.RemoveBuddyMember)
			}

			// 菜品管理
			dishes := protected.Group("/dishes")
			{
				dishes.GET("", dishHandler.ListDishes)
				dishes.POST("", dishHandler.CreateDish)
				dishes.GET("/:id", dishHandler.GetDish)
				dishes.PUT("/:id", dishHandler.UpdateDish)
				dishes.DELETE("/:id", dishHandler.DeleteDish)
				dishes.POST("/import", dishHandler.ImportFromPlaza)
			}

			// 学菜广场
			plaza := protected.Group("/plaza")
			{
				plaza.GET("", dishHandler.SearchPlaza)
				plaza.GET("/categories", dishHandler.GetPlazaCategories)
			}

			// 订单管理
			orders := protected.Group("/orders")
			{
				orders.GET("", orderHandler.ListOrders)
				orders.POST("", orderHandler.CreateOrder)
				orders.GET("/:id", orderHandler.GetOrder)
				orders.POST("/:id/confirm", orderHandler.ConfirmOrder)
				orders.POST("/:id/reject", orderHandler.RejectOrder)
				orders.POST("/:id/cancel", orderHandler.CancelOrder)
				orders.POST("/:id/vote", orderHandler.VoteOrder)
				orders.GET("/:id/votes", orderHandler.GetOrderVotes)
			}

			// 日历记录
			calendar := protected.Group("/calendar")
			{
				calendar.GET("/records", calendarHandler.ListRecords)
				calendar.GET("/records/date", calendarHandler.ListRecordsByDate)
				calendar.POST("/records", calendarHandler.CreateRecord)
				calendar.GET("/records/:id", calendarHandler.GetRecord)
				calendar.PUT("/records/:id", calendarHandler.UpdateRecord)
				calendar.DELETE("/records/:id", calendarHandler.DeleteRecord)
				calendar.POST("/records/:id/comments", calendarHandler.AddComment)
				calendar.POST("/records/:id/photos", calendarHandler.AddPhoto)
				calendar.GET("/stats", calendarHandler.GetMonthlyStats)
			}

			// 心愿清单
			wishes := protected.Group("/wishes")
			{
				wishes.GET("", featureHandler.ListWishes)
				wishes.POST("", featureHandler.CreateWish)
				wishes.POST("/:id/complete", featureHandler.CompleteWish)
				wishes.DELETE("/:id", featureHandler.DeleteWish)
			}

			// 签到
			checkin := protected.Group("/checkin")
			{
				checkin.POST("", featureHandler.Checkin)
				checkin.GET("/status", featureHandler.GetCheckinStatus)
			}

			// 菜篮子
			basket := protected.Group("/basket")
			{
				basket.GET("", featureHandler.ListBasket)
				basket.POST("", featureHandler.AddToBasket)
				basket.POST("/:id/toggle", featureHandler.ToggleBasketPurchased)
				basket.DELETE("/:id", featureHandler.DeleteBasket)
			}

			// 预算
			budget := protected.Group("/budget")
			{
				budget.GET("", featureHandler.GetBudget)
				budget.POST("", featureHandler.SetBudget)
			}

			// 积分
			points := protected.Group("/points")
			{
				points.GET("", featureHandler.GetPointHistory)
			}
		}
	}

	return r
}