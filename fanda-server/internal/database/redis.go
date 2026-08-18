package database

import (
	"context"
	"fmt"
	"log"

	"fanda-server/internal/config"

	"github.com/redis/go-redis/v9"
)

// RDB 是全局 Redis 客户端；当前 Redis 为可选依赖，连接失败不会阻断主服务。
var RDB *redis.Client

// InitRedis 根据配置创建 Redis 客户端并通过 Ping 验证连通性。
func InitRedis(cfg *config.Config) {
	RDB = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.RedisHost, cfg.RedisPort),
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})

	ctx := context.Background()
	// 缓存不可用时仅记录日志，避免影响依赖 PostgreSQL 的核心业务能力。
	if err := RDB.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️ Redis 连接失败: %v（缓存功能将不可用）", err)
		return
	}

	log.Println("Redis 连接成功")
}
