package database

import (
	"fmt"
	"log"

	"fanda-server/internal/config"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

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
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	return db, nil
}

func InitPostgres(cfg *config.Config) {
	var err error
	DB, err = OpenPostgres(cfg)
	if err != nil {
		log.Fatalf("无法连接数据库: %v", err)
	}
	log.Println("PostgreSQL 连接成功")
}
