package service

import (
	"context"
	"testing"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
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
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
		`CREATE TABLE wish_items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, name TEXT NOT NULL, note TEXT, dish_id TEXT, is_completed BOOLEAN, created_at DATETIME)`,
		`CREATE TABLE shopping_baskets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, name TEXT NOT NULL, quantity TEXT, is_purchased BOOLEAN, created_at DATETIME)`,
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
	// 测试意图：活跃 table_members 记录应允许用户访问对应餐桌。
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
	// 测试意图：未在 table_members 中的用户必须被拒绝访问餐桌。
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
	// outsiderUID 模拟非创建者，关键断言是越权完成失败且心愿状态不变。
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
		ID:      wishID,
		UserID:  ownerUID,
		TableID: groupID,
		Name:    "周末吃火锅",
	}).Error; err != nil {
		t.Fatal(err)
	}

	err := NewWishService().CompleteWish(context.Background(), outsiderUID, wishID)
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
	// itemID 指向 ownerUID 的菜篮子项，越权切换失败后 IsPurchased 应保持 false。
	outsiderUID := uuid.New()
	itemID := uuid.New()

	if err := database.DB.Create(&model.User{UID: ownerUID, Nickname: "owner"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.User{UID: outsiderUID, Nickname: "outsider"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.DB.Create(&model.ShoppingBasket{
		ID:      itemID,
		UserID:  ownerUID,
		TableID: uuid.New(),
		Name:    "鸡蛋",
	}).Error; err != nil {
		t.Fatal(err)
	}

	err := NewBasketService().ToggleBasketPurchased(context.Background(), outsiderUID, itemID)
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

func TestRemoveBuddyMemberRevokesTableAccess(t *testing.T) {
	_, ownerID, targetID, groupID := setupBuddyRemovalFixture(t)
	ctx := context.Background()
	require.NoError(t, CanAccessTable(ctx, targetID, groupID))

	err := NewAuthService(nil).RemoveBuddyMember(ctx, ownerID, groupID.String(), targetID.String())

	require.NoError(t, err)
	require.Error(t, CanAccessTable(ctx, targetID, groupID))
}

func TestRemoveBuddyMemberRejectsSelfRemoval(t *testing.T) {
	_, ownerID, _, groupID := setupBuddyRemovalFixture(t)
	err := NewAuthService(nil).RemoveBuddyMember(context.Background(), ownerID, groupID.String(), ownerID.String())
	require.EqualError(t, err, "不能移除自己")
}

func TestRemoveBuddyMemberRejectsNonAdmin(t *testing.T) {
	db, _, targetID, groupID := setupBuddyRemovalFixture(t)
	nonAdminID := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: nonAdminID, Nickname: "普通成员"}).Error)
	require.NoError(t, db.Create(&model.BuddyMember{
		ID: uuid.New(), GroupID: groupID, UserID: nonAdminID, Role: "member",
	}).Error)

	err := NewAuthService(nil).RemoveBuddyMember(context.Background(), nonAdminID, groupID.String(), targetID.String())

	require.EqualError(t, err, "没有移除权限")
	require.NoError(t, CanAccessTable(context.Background(), targetID, groupID))
}

func TestRemoveBuddyMemberRollsBackWhenTableMemberDeleteFails(t *testing.T) {
	db, ownerID, targetID, groupID := setupBuddyRemovalFixture(t)
	require.NoError(t, db.Exec(`
		CREATE TRIGGER fail_table_member_delete
		BEFORE DELETE ON table_members
		BEGIN
			SELECT RAISE(FAIL, 'forced table member delete failure');
		END
	`).Error)

	err := NewAuthService(nil).RemoveBuddyMember(context.Background(), ownerID, groupID.String(), targetID.String())

	require.Error(t, err)
	var count int64
	require.NoError(t, db.Model(&model.BuddyMember{}).
		Where("group_id = ? AND user_id = ?", groupID, targetID).Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func setupBuddyRemovalFixture(t *testing.T) (*gorm.DB, uuid.UUID, uuid.UUID, uuid.UUID) {
	t.Helper()
	db := setupAuthzTestDB(t)
	ownerID, targetID, groupID := uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, db.Create(&model.User{UID: ownerID, Nickname: "群主"}).Error)
	require.NoError(t, db.Create(&model.User{UID: targetID, Nickname: "待移除成员"}).Error)
	require.NoError(t, db.Create(&model.BuddyGroup{
		ID: groupID, Name: "测试饭搭", OwnerID: ownerID, MaxMember: 10, Status: "active",
	}).Error)
	require.NoError(t, db.Create(&model.BuddyMember{
		ID: uuid.New(), GroupID: groupID, UserID: ownerID, Role: "owner",
	}).Error)
	require.NoError(t, db.Create(&model.BuddyMember{
		ID: uuid.New(), GroupID: groupID, UserID: targetID, Role: "member",
	}).Error)
	require.NoError(t, db.Create(&model.Table{
		ID: groupID, Type: "buddy", Name: "测试饭搭", OwnerID: ownerID, Status: "active",
	}).Error)
	require.NoError(t, db.Create(&model.TableMember{
		ID: uuid.New(), TableID: groupID, UserID: ownerID, Role: "owner", Status: "active",
	}).Error)
	require.NoError(t, db.Create(&model.TableMember{
		ID: uuid.New(), TableID: groupID, UserID: targetID, Role: "member", Status: "active",
	}).Error)
	return db, ownerID, targetID, groupID
}
