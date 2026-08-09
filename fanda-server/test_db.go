package main

import (
	"fmt"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// 尝试 URL 格式
	dsn := "postgres://postgres@127.0.0.1:5432/fanda?sslmode=disable&TimeZone=Asia/Shanghai"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("连接失败: %v", err)
	}

	// 检查当前数据库
	var dbName string
	db.Raw("SELECT current_database()").Scan(&dbName)
	fmt.Printf("当前数据库: %s\n", dbName)

	// 列出所有表
	var tables []string
	db.Raw("SELECT tablename FROM pg_tables WHERE schemaname = 'public'").Scan(&tables)
	fmt.Printf("public schema 中的表: %v\n", tables)

	// 测试查询
	var result []map[string]interface{}
	tx := db.Raw("SELECT * FROM users LIMIT 1").Scan(&result)
	if tx.Error != nil {
		log.Fatalf("查询失败: %v", tx.Error)
	}
	fmt.Printf("查询成功，rows: %d\n", len(result))
}