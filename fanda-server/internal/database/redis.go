package database

import (
	"context"
	"fmt"
	"log"

	"fanda-server/internal/config"

	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client

func InitRedis(cfg *config.Config) {
	RDB = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%s", cfg.RedisHost, cfg.RedisPort),
		Password: cfg.RedisPassword,
		DB:       cfg.RedisDB,
	})

	ctx := context.Background()
	if err := RDB.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️ Redis 连接失败: %v（缓存功能将不可用）", err)
		return
	}

	log.Println("Redis 连接成功")
}