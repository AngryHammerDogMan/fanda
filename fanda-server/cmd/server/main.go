// cmd/server 是饭搭子后端的 HTTP 服务入口，负责串联配置、数据库、
// 缓存和路由初始化；业务规则保留在 internal 下的各层实现中。
package main

import (
	"log"

	"fanda-server/internal/config"
	"fanda-server/internal/database"
	"fanda-server/internal/router"
)

// main 是服务进程入口，所有初始化失败都会在启动阶段快速暴露。
func main() {
	// 启动顺序保持为“配置 → 基础设施 → 路由 → 监听”，便于启动失败时定位问题。
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("配置加载失败: %v", err)
	}

	// PostgreSQL 是核心数据存储，初始化失败会在 database 层直接终止启动。
	database.InitPostgres(cfg)

	// Redis 仅作为可选缓存能力，连接失败不阻塞主服务启动。
	database.InitRedis(cfg)

	// 路由层集中挂载公开接口、JWT 保护接口和后台管理接口。
	r := router.Setup(cfg)

	// 最后启动 Gin HTTP Server，对外暴露小程序和后台管理 API。
	log.Printf("🚀 服务启动于 :%s (模式: %s)", cfg.ServerPort, cfg.ServerMode)
	if err := r.Run(":" + cfg.ServerPort); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
