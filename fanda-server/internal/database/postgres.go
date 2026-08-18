// Package database 集中初始化外部存储连接，并暴露业务层复用的数据库客户端。
package database

import (
	"fmt"
	"log"

	"fanda-server/internal/config"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// DB 是全局 PostgreSQL/GORM 连接，handler 不直接使用，service 层负责业务读写。
var DB *gorm.DB

// OpenPostgres 根据配置创建 GORM 连接，并按运行模式设置 SQL 日志级别。
func OpenPostgres(cfg *config.Config) (*gorm.DB, error) {
	// 使用 URL 格式的 DSN，pgx 驱动对 key=value 格式的 dbname 参数支持有问题
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s&TimeZone=Asia/Shanghai",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName, cfg.DBSSLMode,
	)

	logLevel := logger.Info
	if cfg.ServerMode == "release" {
		logLevel = logger.Warn
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, _ := db.DB()
	// 连接池参数限制空闲和最大连接数，避免高并发下无限创建数据库连接。
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	return db, nil
}

// InitPostgres 初始化全局 DB；启动阶段连接失败视为致命错误并终止服务。
func InitPostgres(cfg *config.Config) {
	var err error
	DB, err = OpenPostgres(cfg)
	if err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}
	log.Println("PostgreSQL 连接成功")
}
