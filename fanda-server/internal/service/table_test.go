package service

import (
	"context"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupTableTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "test.db")+"?_busy_timeout=5000"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatalf("初始化内存数据库失败: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("获取底层数据库失败: %v", err)
	}
	sqlDB.SetMaxOpenConns(8)
	if err := db.Exec("PRAGMA journal_mode=WAL").Error; err != nil {
		t.Fatalf("设置 WAL 失败: %v", err)
	}
	if err := db.Exec("PRAGMA busy_timeout=5000").Error; err != nil {
		t.Fatalf("设置 busy timeout 失败: %v", err)
	}
	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT, dy_openid TEXT, phone TEXT, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE couples (id TEXT PRIMARY KEY, user1_id TEXT NOT NULL, user2_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at DATETIME)`,
		`CREATE TABLE couple_members (id TEXT PRIMARY KEY, couple_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active')`,
		`CREATE UNIQUE INDEX idx_couple_members_active_user ON couple_members(user_id) WHERE status = 'active'`,
		`CREATE TABLE couple_invites (id TEXT PRIMARY KEY, inviter_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, expires_at DATETIME NOT NULL, is_used BOOLEAN DEFAULT false, created_at DATETIME)`,
		`CREATE TABLE buddy_groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL, max_member INTEGER DEFAULT 10, status TEXT NOT NULL DEFAULT 'active', created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE buddy_members (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', joined_at DATETIME)`,
		`CREATE TABLE buddy_invites (id TEXT PRIMARY KEY, group_id TEXT NOT NULL, inviter_id TEXT NOT NULL, code TEXT NOT NULL UNIQUE, expires_at DATETIME NOT NULL, is_used BOOLEAN DEFAULT false, created_at DATETIME)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
		`CREATE UNIQUE INDEX idx_one_owned_personal_table_per_user ON tables(owner_id) WHERE type = 'personal' AND status = 'active'`,
		`CREATE UNIQUE INDEX idx_table_member_user ON table_members(table_id, user_id)`,
		`CREATE TABLE budget_settings (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, month TEXT NOT NULL, budget REAL NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE UNIQUE INDEX idx_budget_unique ON budget_settings(user_id, table_id, month)`,
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

func TestEnsurePersonalTableConcurrentFirstCreateReturnsSameTable(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	uid := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)
	require.NoError(t, db.Callback().Create().Before("gorm:create").Register("slow_personal_table_create", func(tx *gorm.DB) {
		if tx.Statement.Schema != nil && tx.Statement.Schema.Table == "tables" {
			if table, ok := tx.Statement.Dest.(*model.Table); ok && table.Type == "personal" {
				time.Sleep(20 * time.Millisecond)
			}
		}
	}))

	svc := NewTableService()
	const workers = 8
	start := make(chan struct{})
	tables := make([]*model.Table, workers)
	errs := make([]error, workers)
	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			<-start
			tables[idx], errs[idx] = svc.EnsurePersonalTable(context.Background(), uid)
		}(i)
	}
	close(start)
	wg.Wait()

	var tableID uuid.UUID
	for i := 0; i < workers; i++ {
		require.NoError(t, errs[i])
		require.NotNil(t, tables[i])
		require.Equal(t, "personal", tables[i].Type)
		if i == 0 {
			tableID = tables[i].ID
			continue
		}
		require.Equal(t, tableID, tables[i].ID)
	}
	var tableCount int64
	require.NoError(t, db.Model(&model.Table{}).Where("type = ? AND status = ? AND owner_id = ?", "personal", "active", uid).Count(&tableCount).Error)
	require.EqualValues(t, 1, tableCount)
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

func TestGetBudgetReturnsCurrentUsersBudgetForSameTableAndMonth(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	userA := uuid.New()
	userB := uuid.New()
	tableID := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: userA, Nickname: "user-a"}).Error)
	require.NoError(t, db.Create(&model.User{UID: userB, Nickname: "user-b"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "buddy", Name: "同桌预算", OwnerID: userA, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: userA, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: userB, Role: "member", Status: "active"}).Error)
	month := "2026-08"
	require.NoError(t, db.Create(&model.BudgetSetting{ID: uuid.New(), UserID: userB, TableID: tableID, Month: month, Budget: 800}).Error)
	require.NoError(t, db.Create(&model.BudgetSetting{ID: uuid.New(), UserID: userA, TableID: tableID, Month: month, Budget: 300}).Error)

	budget, err := NewBudgetService().GetBudget(context.Background(), userA, tableID, month)

	require.NoError(t, err)
	require.Equal(t, userA, budget.UserID)
	require.Equal(t, 300.0, budget.Budget)
}

func TestJoinCoupleCreatesCoupleTableWithBothMembers(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	inviterID := uuid.New()
	partnerID := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: inviterID, Nickname: "inviter"}).Error)
	require.NoError(t, db.Create(&model.User{UID: partnerID, Nickname: "partner"}).Error)
	invite := model.CoupleInvite{
		ID:        uuid.New(),
		InviterID: inviterID,
		Code:      "CP1234",
		ExpiresAt: time.Now().Add(time.Hour),
	}
	require.NoError(t, db.Create(&invite).Error)

	err := NewAuthService(nil).JoinCouple(context.Background(), partnerID, invite.Code)

	require.NoError(t, err)
	var couple model.Couple
	require.NoError(t, db.First(&couple, "user1_id = ? AND user2_id = ?", inviterID, partnerID).Error)
	var table model.Table
	require.NoError(t, db.First(&table, "id = ?", couple.ID).Error)
	require.Equal(t, "couple", table.Type)
	require.Equal(t, inviterID, table.OwnerID)
	var members []model.TableMember
	require.NoError(t, db.Order("role DESC").Find(&members, "table_id = ?", couple.ID).Error)
	require.Len(t, members, 2)
	require.ElementsMatch(t, []uuid.UUID{inviterID, partnerID}, []uuid.UUID{members[0].UserID, members[1].UserID})
	var coupleMembers []model.CoupleMember
	require.NoError(t, db.Find(&coupleMembers, "couple_id = ?", couple.ID).Error)
	require.Len(t, coupleMembers, 2)
	require.ElementsMatch(t, []uuid.UUID{inviterID, partnerID}, []uuid.UUID{coupleMembers[0].UserID, coupleMembers[1].UserID})
}

func TestCreateBuddyGroupCreatesBuddyTableWithOwnerMember(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	ownerID := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: ownerID, Nickname: "owner"}).Error)

	group, err := NewAuthService(nil).CreateBuddyGroup(context.Background(), ownerID, "周末饭搭子")

	require.NoError(t, err)
	var table model.Table
	require.NoError(t, db.First(&table, "id = ?", group.ID).Error)
	require.Equal(t, "buddy", table.Type)
	require.Equal(t, ownerID, table.OwnerID)
	require.Equal(t, "周末饭搭子", table.Name)
	var member model.TableMember
	require.NoError(t, db.First(&member, "table_id = ? AND user_id = ?", group.ID, ownerID).Error)
	require.Equal(t, "owner", member.Role)
	require.Equal(t, "active", member.Status)
}

func TestJoinBuddyGroupAddsBuddyTableMember(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	ownerID := uuid.New()
	joinerID := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: ownerID, Nickname: "owner"}).Error)
	require.NoError(t, db.Create(&model.User{UID: joinerID, Nickname: "joiner"}).Error)
	authSvc := NewAuthService(nil)
	group, err := authSvc.CreateBuddyGroup(context.Background(), ownerID, "早餐搭子")
	require.NoError(t, err)
	invite := model.BuddyInvite{
		ID:        uuid.New(),
		GroupID:   group.ID,
		InviterID: ownerID,
		Code:      "BD1234",
		ExpiresAt: time.Now().Add(time.Hour),
	}
	require.NoError(t, db.Create(&invite).Error)

	err = authSvc.JoinBuddyGroup(context.Background(), joinerID, group.ID.String(), invite.Code)

	require.NoError(t, err)
	var member model.TableMember
	require.NoError(t, db.First(&member, "table_id = ? AND user_id = ?", group.ID, joinerID).Error)
	require.Equal(t, "member", member.Role)
	require.Equal(t, "active", member.Status)
}
