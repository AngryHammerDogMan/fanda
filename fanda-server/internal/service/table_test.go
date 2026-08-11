package service

import (
	"context"
	"testing"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupTableTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("初始化内存数据库失败: %v", err)
	}
	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT, dy_openid TEXT, phone TEXT, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("创建测试表失败: %v", err)
		}
	}
	return db
}

func TestEnsurePersonalTableCreatesOneTable(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	uid := uuid.New()
	if err := db.Create(&model.User{UID: uid, Nickname: "tester"}).Error; err != nil {
		t.Fatal(err)
	}

	svc := NewTableService()
	table, err := svc.EnsurePersonalTable(context.Background(), uid)
	if err != nil {
		t.Fatalf("应创建个人餐桌: %v", err)
	}
	if table.Type != "personal" {
		t.Fatalf("餐桌类型应为 personal，实际为 %q", table.Type)
	}
	if table.Name != "我的餐桌" {
		t.Fatalf("餐桌名称应为 我的餐桌，实际为 %q", table.Name)
	}

	tableAgain, err := svc.EnsurePersonalTable(context.Background(), uid)
	if err != nil {
		t.Fatalf("再次获取个人餐桌不应失败: %v", err)
	}
	if table.ID != tableAgain.ID {
		t.Fatalf("重复 Ensure 不应创建新餐桌: first=%s again=%s", table.ID, tableAgain.ID)
	}
}

func TestListTablesReturnsUserTables(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	uid := uuid.New()
	if err := db.Create(&model.User{UID: uid, Nickname: "tester"}).Error; err != nil {
		t.Fatal(err)
	}

	svc := NewTableService()
	if _, err := svc.EnsurePersonalTable(context.Background(), uid); err != nil {
		t.Fatalf("应创建个人餐桌: %v", err)
	}

	tables, err := svc.ListTables(context.Background(), uid)
	if err != nil {
		t.Fatalf("应能列出用户餐桌: %v", err)
	}
	if len(tables) != 1 {
		t.Fatalf("应返回 1 个餐桌，实际返回 %d 个", len(tables))
	}
	if tables[0].Type != "personal" {
		t.Fatalf("餐桌类型应为 personal，实际为 %q", tables[0].Type)
	}
}
