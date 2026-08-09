package main

import (
	"log"

	"fanda-server/internal/config"
	"fanda-server/internal/database"
	"fanda-server/internal/router"
)

func main() {
	// 加载配置
	cfg := config.Load()

	// 初始化数据库
	database.InitPostgres(cfg)

	// 初始化 Redis（连接失败也继续运行）
	database.InitRedis(cfg)

	// 设置路由
	r := router.Setup(cfg)

	// 启动服务
	log.Printf("🚀 服务启动于 :%s (模式: %s)", cfg.ServerPort, cfg.ServerMode)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}