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

// setupAuthzTestDB 构造鉴权相关的最小表集合，专注验证成员归属和资源所有者限制。
func setupAuthzTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("初始化内存数据库失败: %v", err)
	}
	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT, dy_openid TEXT, phone TEXT, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE couples (id TEXT PRIMARY KEY, user1_id TEXT NOT NULL, user2_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME)`,
		`CREATE TABLE buddy_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, max_member INTEGER, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE buddy_members (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, joined_at DATETIME)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
		`CREATE TABLE wish_items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_type TEXT NOT NULL, group_id TEXT NOT NULL, name TEXT NOT NULL, note TEXT, dish_id TEXT, is_completed BOOLEAN, created_at DATETIME)`,
		`CREATE TABLE shopping_baskets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, group_type TEXT NOT NULL, group_id TEXT NOT NULL, name TEXT NOT NULL, quantity TEXT, is_purchased BOOLEAN, created_at DATETIME)`,
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("创建测试表失败: %v", err)
		}
	}
	database.DB = db
	return db
}

func TestCanAccessTableAllowsActiveMember(t *testing.T) {
	db := setupAuthzTestDB(t)
	database.DB = db

	uid := uuid.New()
	tableID := uuid.New()

	if err := db.Exec(`INSERT INTO users (uid, nickname) VALUES (?, ?)`, uid, "tester").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO tables (id, type, name, owner_id, status) VALUES (?, ?, ?, ?, ?)`, tableID, "personal", "我的餐桌", uid, "active").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO table_members (id, table_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)`, uuid.New(), tableID, uid, "owner", "active").Error; err != nil {
		t.Fatal(err)
	}

	if err := CanAccessTable(context.Background(), uid, tableID); err != nil {
		t.Fatalf("活跃餐桌成员应可访问餐桌: %v", err)
	}
}

func TestCanAccessTableRejectsNonMember(t *testing.T) {
	db := setupAuthzTestDB(t)
	database.DB = db

	ownerID := uuid.New()
	otherID := uuid.New()
	tableID := uuid.New()

	if err := db.Exec(`INSERT INTO users (uid, nickname) VALUES (?, ?)`, ownerID, "owner").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO users (uid, nickname) VALUES (?, ?)`, otherID, "other").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO tables (id, type, name, owner_id, status) VALUES (?, ?, ?, ?, ?)`, tableID, "personal", "我的餐桌", ownerID, "active").Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`INSERT INTO table_members (id, table_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)`, uuid.New(), tableID, ownerID, "owner", "active").Error; err != nil {
		t.Fatal(err)
	}

	if err := CanAccessTable(context.Background(), otherID, tableID); err == nil {
		t.Fatal("非餐桌成员不应访问餐桌")
	}
}

// TestCanAccessGroupRejectsNonMember 覆盖组合鉴权：成员可访问，非成员被拒绝。
func TestCanAccessGroupRejectsNonMember(t *testing.T) {
	setupAuthzTestDB(t)

	memberUID := uuid.New()
	outsiderUID := uuid.New()
	coupleID := uuid.New()

	if err := database.DB.Create(&model.User{UID: memberUID, Nickname: "member"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.User{UID: outsiderUID, Nickname: "outsider"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.Couple{
		ID:      coupleID,
		User1ID: memberUID,
		User2ID: uuid.New(),
		Status:  "active",
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := CanAccessGroup(context.Background(), memberUID, "couple", coupleID); err != nil {
		t.Fatalf("成员应可访问情侣组合: %v", err)
	}
	if err := CanAccessGroup(context.Background(), outsiderUID, "couple", coupleID); err == nil {
		t.Fatal("非成员不应访问情侣组合")
	}
}

// TestCompleteWishRejectsNonOwner 覆盖心愿所有者约束，避免组内其他成员越权完成心愿。
func TestCompleteWishRejectsNonOwner(t *testing.T) {
	setupAuthzTestDB(t)

	ownerUID := uuid.New()
	outsiderUID := uuid.New()
	groupID := uuid.New()
	wishID := uuid.New()

	if err := database.DB.Create(&model.User{UID: ownerUID, Nickname: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.User{UID: outsiderUID, Nickname: "outsider"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.WishItem{
		ID:        wishID,
		UserID:    ownerUID,
		GroupType: "couple",
		GroupID:   groupID,
		Name:      "周末吃火锅",
	}).Error; err != nil {
		t.Fatal(err)
	}

	err := NewFeatureService().CompleteWish(context.Background(), outsiderUID, wishID)
	if err == nil {
		t.Fatal("非创建者不应完成他人的心愿")
	}

	var wish model.WishItem
	if err := database.DB.First(&wish, "id = ?", wishID).Error; err != nil {
		t.Fatal(err)
	}
	if wish.IsCompleted {
		t.Fatal("越权完成失败后心愿状态不应改变")
	}
}

// TestToggleBasketRejectsNonOwner 覆盖菜篮子所有者约束，越权失败后状态不应被修改。
func TestToggleBasketRejectsNonOwner(t *testing.T) {
	setupAuthzTestDB(t)

	ownerUID := uuid.New()
	outsiderUID := uuid.New()
	itemID := uuid.New()

	if err := database.DB.Create(&model.User{UID: ownerUID, Nickname: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.User{UID: outsiderUID, Nickname: "outsider"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.ShoppingBasket{
		ID:        itemID,
		UserID:    ownerUID,
		GroupType: "couple",
		GroupID:   uuid.New(),
		Name:      "鸡蛋",
	}).Error; err != nil {
		t.Fatal(err)
	}

	err := NewFeatureService().ToggleBasketPurchased(context.Background(), outsiderUID, itemID)
	if err == nil {
		t.Fatal("非创建者不应切换他人的菜篮子项")
	}

	var item model.ShoppingBasket
	if err := database.DB.First(&item, "id = ?", itemID).Error; err != nil {
		t.Fatal(err)
	}
	if item.IsPurchased {
		t.Fatal("越权切换失败后菜篮子状态不应改变")
	}
}
