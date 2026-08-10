package service

import (
	"context"
	"testing"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupPhoneMergeTestDB(t *testing.T) {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("初始化内存数据库失败: %v", err)
	}

	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT UNIQUE, dy_openid TEXT UNIQUE, phone TEXT UNIQUE, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE dishes (id TEXT PRIMARY KEY, owner_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE orders (id TEXT PRIMARY KEY, creator_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE calendar_records (id TEXT PRIMARY KEY, user_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE record_comments (id TEXT PRIMARY KEY, user_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE wish_items (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE checkins (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE point_records (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE budget_settings (id TEXT PRIMARY KEY, user_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE shopping_baskets (id TEXT PRIMARY KEY, user_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE order_votes (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE couples (id TEXT PRIMARY KEY, user1_id TEXT, user2_id TEXT)`,
		`CREATE TABLE buddy_members (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE buddy_groups (id TEXT PRIMARY KEY, owner_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE couple_invites (id TEXT PRIMARY KEY, inviter_id TEXT)`,
		`CREATE TABLE buddy_invites (id TEXT PRIMARY KEY, inviter_id TEXT)`,
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("创建测试表失败: %v", err)
		}
	}

	database.DB = db
}

func TestBindPhoneMergesExistingPhoneAccount(t *testing.T) {
	setupPhoneMergeTestDB(t)

	phone := "13800138000"
	wxOpenID := "wx-openid"
	dyOpenID := "dy-openid"
	targetUID := uuid.New()
	sourceUID := uuid.New()

	if err := database.DB.Create(&model.User{
		UID:      targetUID,
		WxOpenID: &wxOpenID,
		Phone:    &phone,
		Nickname: "wechat-user",
		Points:   10,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.User{
		UID:      sourceUID,
		DyOpenID: &dyOpenID,
		Nickname: "douyin-user",
		Points:   5,
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := NewAuthService(nil).BindPhone(context.Background(), sourceUID, phone); err != nil {
		t.Fatalf("绑定已有手机号应自动合并账号: %v", err)
	}

	var merged model.User
	if err := database.DB.First(&merged, "uid = ?", targetUID).Error; err != nil {
		t.Fatal(err)
	}
	if merged.WxOpenID == nil || *merged.WxOpenID != wxOpenID {
		t.Fatal("合并后应保留原微信 openid")
	}
	if merged.DyOpenID == nil || *merged.DyOpenID != dyOpenID {
		t.Fatal("合并后应写入抖音 openid")
	}
	if merged.Points != 15 {
		t.Fatalf("合并后积分应累加，实际为 %d", merged.Points)
	}

	var count int64
	if err := database.DB.Model(&model.User{}).Where("uid = ?", sourceUID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatal("合并后源平台账号应被删除")
	}
}
