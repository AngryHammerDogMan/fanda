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

// setupFeatureSplitTestDB 构造心愿、菜篮子和预算拆分服务所需的最小内存数据库。
func setupFeatureSplitTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	// stmts 覆盖拆分服务直接访问的表，预算表包含唯一索引用于验证 upsert 语义。
	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT, dy_openid TEXT, phone TEXT, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
		`CREATE TABLE wish_items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, name TEXT NOT NULL, note TEXT, dish_id TEXT, is_completed BOOLEAN, created_at DATETIME)`,
		`CREATE TABLE shopping_baskets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, name TEXT NOT NULL, quantity TEXT, is_purchased BOOLEAN, created_at DATETIME)`,
		`CREATE TABLE budget_settings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, month TEXT NOT NULL, budget REAL NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE UNIQUE INDEX idx_budget_unique ON budget_settings(user_id, table_id, month)`,
	}
	for _, stmt := range stmts {
		require.NoError(t, db.Exec(stmt).Error)
	}
	database.DB = db
	return db
}

func createFeatureSplitMember(t *testing.T, db *gorm.DB) (uuid.UUID, uuid.UUID) {
	t.Helper()

	// uid/tableID 是当前测试用户及其可访问餐桌，供各独立服务复用。
	uid := uuid.New()
	tableID := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "personal", Name: "我的餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active"}).Error)
	return uid, tableID
}

func TestBudgetServiceSetBudgetCanBeCalledIndependently(t *testing.T) {
	// 测试意图：预算服务脱离 FeatureService 门面后仍可独立设置并读取预算。
	db := setupFeatureSplitTestDB(t)
	uid, tableID := createFeatureSplitMember(t, db)

	budget, err := NewBudgetService().SetBudget(context.Background(), uid, BudgetReq{
		TableID: tableID,
		Month:   "2026-08",
		Budget:  350,
	})

	require.NoError(t, err)
	require.Equal(t, uid, budget.UserID)
	require.Equal(t, tableID, budget.TableID)
	require.Equal(t, 350.0, budget.Budget)

	updated, err := NewBudgetService().GetBudget(context.Background(), uid, tableID, "2026-08")
	require.NoError(t, err)
	require.Equal(t, budget.ID, updated.ID)
	require.Equal(t, 350.0, updated.Budget)
}

func TestBasketServiceAddToBasketCanBeCalledIndependently(t *testing.T) {
	// 测试意图：菜篮子服务脱离门面后仍可独立新增并按餐桌列出条目。
	db := setupFeatureSplitTestDB(t)
	uid, tableID := createFeatureSplitMember(t, db)

	item, err := NewBasketService().AddToBasket(context.Background(), uid, BasketReq{
		TableID: tableID,
		Name:    "鸡蛋",
	})

	require.NoError(t, err)
	require.Equal(t, uid, item.UserID)
	require.Equal(t, tableID, item.TableID)
	require.Equal(t, "鸡蛋", item.Name)
	require.Equal(t, "1", item.Quantity)

	items, err := NewBasketService().ListBasket(context.Background(), uid, tableID)
	require.NoError(t, err)
	require.Len(t, items, 1)
	require.Equal(t, item.ID, items[0].ID)
}

func TestWishServiceCreateAndListCanBeCalledIndependently(t *testing.T) {
	// 测试意图：心愿服务脱离门面后仍可独立创建并按未完成状态过滤列表。
	db := setupFeatureSplitTestDB(t)
	uid, tableID := createFeatureSplitMember(t, db)

	wish, err := NewWishService().CreateWish(context.Background(), uid, CreateWishReq{
		TableID: tableID,
		Name:    "周末吃火锅",
		Note:    "鸳鸯锅",
	})

	require.NoError(t, err)
	require.Equal(t, uid, wish.UserID)
	require.Equal(t, tableID, wish.TableID)
	require.Equal(t, "周末吃火锅", wish.Name)

	incomplete := false
	// incomplete 表示只查询未完成心愿，关键断言是刚创建的心愿能被列表返回。
	wishes, err := NewWishService().ListWishes(context.Background(), uid, tableID, &incomplete)
	require.NoError(t, err)
	require.Len(t, wishes, 1)
	require.Equal(t, wish.ID, wishes[0].ID)
}
