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

// setupPhoneMergeTestDB 构造仅覆盖合并路径所需字段的内存库，避免测试依赖真实 PostgreSQL。
func setupPhoneMergeTestDB(t *testing.T) {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("初始化内存数据库失败: %v", err)
	}

	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT UNIQUE, dy_openid TEXT UNIQUE, phone TEXT UNIQUE, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE dishes (id TEXT PRIMARY KEY, owner_id TEXT, table_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE orders (id TEXT PRIMARY KEY, creator_id TEXT, table_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE calendar_records (id TEXT PRIMARY KEY, user_id TEXT, table_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE record_comments (id TEXT PRIMARY KEY, user_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE wish_items (id TEXT PRIMARY KEY, user_id TEXT, table_id TEXT)`,
		`CREATE TABLE checkins (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE point_records (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE budget_settings (id TEXT PRIMARY KEY, user_id TEXT, table_id TEXT, month TEXT, budget REAL, created_at DATETIME, updated_at DATETIME, UNIQUE(user_id, table_id, month))`,
		`CREATE TABLE shopping_baskets (id TEXT PRIMARY KEY, user_id TEXT, table_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE order_votes (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE couples (id TEXT PRIMARY KEY, user1_id TEXT, user2_id TEXT, status TEXT, created_at DATETIME)`,
		`CREATE TABLE couple_members (id TEXT PRIMARY KEY, couple_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, UNIQUE(user_id))`,
		`CREATE TABLE buddy_members (id TEXT PRIMARY KEY, user_id TEXT)`,
		`CREATE TABLE buddy_groups (id TEXT PRIMARY KEY, owner_id TEXT, updated_at DATETIME)`,
		`CREATE TABLE couple_invites (id TEXT PRIMARY KEY, inviter_id TEXT)`,
		`CREATE TABLE buddy_invites (id TEXT PRIMARY KEY, inviter_id TEXT)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE UNIQUE INDEX idx_one_owned_personal_table_per_user ON tables(owner_id) WHERE type = 'personal' AND status = 'active'`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME, UNIQUE(table_id, user_id))`,
		`CREATE TABLE order_participants (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME, UNIQUE(order_id, user_id))`,
	}
	for _, stmt := range stmts {
		if err := db.Exec(stmt).Error; err != nil {
			t.Fatalf("创建测试表失败: %v", err)
		}
	}

	database.DB = db
}

// TestBindPhoneMergesExistingPhoneAccount 覆盖“抖音账号绑定已被微信账号占用的手机号”场景：
// 期望 openid 合并、积分累加，并删除源平台账号。
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

func TestBindPhoneMigratesTableOwnershipMembersAndOrderParticipants(t *testing.T) {
	setupPhoneMergeTestDB(t)

	phone := "13800138001"
	targetUID := uuid.New()
	sourceUID := uuid.New()
	tableID := uuid.New()
	orderID := uuid.New()

	require.NoError(t, database.DB.Create(&model.User{
		UID:      targetUID,
		Phone:    &phone,
		Nickname: "phone-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.User{
		UID:      sourceUID,
		Nickname: "platform-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.Table{
		ID:      tableID,
		Type:    "personal",
		Name:    "我的餐桌",
		OwnerID: sourceUID,
		Status:  "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.TableMember{
		ID:      uuid.New(),
		TableID: tableID,
		UserID:  sourceUID,
		Role:    "owner",
		Status:  "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.OrderParticipant{
		ID:      uuid.New(),
		OrderID: orderID,
		UserID:  sourceUID,
		Status:  "invited",
	}).Error)

	require.NoError(t, NewAuthService(nil).BindPhone(context.Background(), sourceUID, phone))

	var table model.Table
	require.NoError(t, database.DB.First(&table, "id = ?", tableID).Error)
	require.Equal(t, targetUID, table.OwnerID)

	var member model.TableMember
	require.NoError(t, database.DB.First(&member, "table_id = ?", tableID).Error)
	require.Equal(t, targetUID, member.UserID)

	var participant model.OrderParticipant
	require.NoError(t, database.DB.First(&participant, "order_id = ?", orderID).Error)
	require.Equal(t, targetUID, participant.UserID)
}

func TestBindPhoneRemovesConflictingTableMembersAndOrderParticipants(t *testing.T) {
	setupPhoneMergeTestDB(t)

	phone := "13800138002"
	targetUID := uuid.New()
	sourceUID := uuid.New()
	tableID := uuid.New()
	orderID := uuid.New()

	require.NoError(t, database.DB.Create(&model.User{
		UID:      targetUID,
		Phone:    &phone,
		Nickname: "phone-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.User{
		UID:      sourceUID,
		Nickname: "platform-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.Table{
		ID:      tableID,
		Type:    "buddy",
		Name:    "饭搭餐桌",
		OwnerID: targetUID,
		Status:  "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.TableMember{
		ID:      uuid.New(),
		TableID: tableID,
		UserID:  targetUID,
		Role:    "owner",
		Status:  "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.TableMember{
		ID:      uuid.New(),
		TableID: tableID,
		UserID:  sourceUID,
		Role:    "member",
		Status:  "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.OrderParticipant{
		ID:      uuid.New(),
		OrderID: orderID,
		UserID:  targetUID,
		Status:  "accepted",
	}).Error)
	require.NoError(t, database.DB.Create(&model.OrderParticipant{
		ID:      uuid.New(),
		OrderID: orderID,
		UserID:  sourceUID,
		Status:  "invited",
	}).Error)

	require.NoError(t, NewAuthService(nil).BindPhone(context.Background(), sourceUID, phone))

	var memberCount int64
	require.NoError(t, database.DB.Model(&model.TableMember{}).Where("table_id = ?", tableID).Count(&memberCount).Error)
	require.Equal(t, int64(1), memberCount)
	var member model.TableMember
	require.NoError(t, database.DB.First(&member, "table_id = ?", tableID).Error)
	require.Equal(t, targetUID, member.UserID)
	require.Equal(t, "owner", member.Role)

	var participantCount int64
	require.NoError(t, database.DB.Model(&model.OrderParticipant{}).Where("order_id = ?", orderID).Count(&participantCount).Error)
	require.Equal(t, int64(1), participantCount)
	var participant model.OrderParticipant
	require.NoError(t, database.DB.First(&participant, "order_id = ?", orderID).Error)
	require.Equal(t, targetUID, participant.UserID)
	require.Equal(t, "accepted", participant.Status)
}

func TestBindPhoneMergesTwoActivePersonalTablesIntoTargetTable(t *testing.T) {
	setupPhoneMergeTestDB(t)

	phone := "13800138003"
	targetUID := uuid.New()
	sourceUID := uuid.New()
	targetTableID := uuid.New()
	sourceTableID := uuid.New()

	require.NoError(t, database.DB.Create(&model.User{
		UID: targetUID, Phone: &phone, Nickname: "phone-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.User{
		UID: sourceUID, Nickname: "platform-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.Table{
		ID: targetTableID, Type: "personal", Name: "目标个人餐桌", OwnerID: targetUID, Status: "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.Table{
		ID: sourceTableID, Type: "personal", Name: "来源个人餐桌", OwnerID: sourceUID, Status: "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.TableMember{
		ID: uuid.New(), TableID: targetTableID, UserID: targetUID, Role: "owner", Status: "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.TableMember{
		ID: uuid.New(), TableID: sourceTableID, UserID: sourceUID, Role: "owner", Status: "active",
	}).Error)

	dishID := uuid.New()
	orderID := uuid.New()
	recordID := uuid.New()
	require.NoError(t, database.DB.Exec(
		`INSERT INTO dishes (id, owner_id, table_id) VALUES (?, ?, ?)`,
		dishID, sourceUID, sourceTableID,
	).Error)
	require.NoError(t, database.DB.Exec(
		`INSERT INTO orders (id, creator_id, table_id) VALUES (?, ?, ?)`,
		orderID, sourceUID, sourceTableID,
	).Error)
	require.NoError(t, database.DB.Exec(
		`INSERT INTO calendar_records (id, user_id, table_id) VALUES (?, ?, ?)`,
		recordID, sourceUID, sourceTableID,
	).Error)

	require.NoError(t, NewAuthService(nil).BindPhone(context.Background(), sourceUID, phone))

	var activePersonalTables []model.Table
	require.NoError(t, database.DB.Where(
		"type = ? AND status = ? AND owner_id = ?", "personal", "active", targetUID,
	).Find(&activePersonalTables).Error)
	require.Len(t, activePersonalTables, 1)
	require.Equal(t, targetTableID, activePersonalTables[0].ID)

	var sourceTableCount int64
	require.NoError(t, database.DB.Model(&model.Table{}).Where("id = ?", sourceTableID).Count(&sourceTableCount).Error)
	require.Zero(t, sourceTableCount)

	for tableName, id := range map[string]uuid.UUID{
		"dishes": dishID, "orders": orderID, "calendar_records": recordID,
	} {
		var tableID string
		require.NoError(t, database.DB.Raw(
			"SELECT table_id FROM "+tableName+" WHERE id = ?", id,
		).Scan(&tableID).Error)
		require.Equal(t, targetTableID.String(), tableID, tableName)
	}
}

func TestBindPhoneKeepsTargetBudgetOnSameMonthPersonalTableConflict(t *testing.T) {
	setupPhoneMergeTestDB(t)

	phone := "13800138005"
	targetUID := uuid.New()
	sourceUID := uuid.New()
	targetTableID := uuid.New()
	sourceTableID := uuid.New()
	require.NoError(t, database.DB.Create(&model.User{
		UID: targetUID, Phone: &phone, Nickname: "phone-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.User{
		UID: sourceUID, Nickname: "platform-user",
	}).Error)
	require.NoError(t, database.DB.Create(&model.Table{
		ID: targetTableID, Type: "personal", Name: "目标个人餐桌", OwnerID: targetUID, Status: "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.Table{
		ID: sourceTableID, Type: "personal", Name: "来源个人餐桌", OwnerID: sourceUID, Status: "active",
	}).Error)
	require.NoError(t, database.DB.Create(&model.BudgetSetting{
		ID: uuid.New(), UserID: targetUID, TableID: targetTableID, Month: "2026-08", Budget: 1200,
	}).Error)
	require.NoError(t, database.DB.Create(&model.BudgetSetting{
		ID: uuid.New(), UserID: sourceUID, TableID: sourceTableID, Month: "2026-08", Budget: 800,
	}).Error)

	require.NoError(t, NewAuthService(nil).BindPhone(context.Background(), sourceUID, phone))

	var budgets []model.BudgetSetting
	require.NoError(t, database.DB.Where(
		"user_id = ? AND table_id = ? AND month = ?", targetUID, targetTableID, "2026-08",
	).Find(&budgets).Error)
	require.Len(t, budgets, 1)
	require.Equal(t, 1200.0, budgets[0].Budget)
}

func TestCreateCoupleMembersRejectsUserAlreadyInAnotherActiveCouple(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.Exec(`
		CREATE TABLE couple_members (
			id TEXT PRIMARY KEY,
			couple_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			status TEXT NOT NULL
		)
	`).Error)
	require.NoError(t, db.Exec(`
		CREATE UNIQUE INDEX idx_couple_members_active_user
		ON couple_members(user_id) WHERE status = 'active'
	`).Error)

	first := model.Couple{ID: uuid.New(), User1ID: uuid.New(), User2ID: uuid.New(), Status: "active"}
	require.NoError(t, createCoupleMembers(db, first))

	second := model.Couple{ID: uuid.New(), User1ID: first.User2ID, User2ID: uuid.New(), Status: "active"}
	require.Error(t, createCoupleMembers(db, second))

	var count int64
	require.NoError(t, db.Model(&model.CoupleMember{}).Where("couple_id = ?", first.ID).Count(&count).Error)
	require.Equal(t, int64(2), count)
}

func TestBindPhoneMigratesNormalizedCoupleMember(t *testing.T) {
	setupPhoneMergeTestDB(t)

	phone := "13800138004"
	targetUID := uuid.New()
	sourceUID := uuid.New()
	partnerUID := uuid.New()
	coupleID := uuid.New()
	for _, user := range []model.User{
		{UID: targetUID, Phone: &phone, Nickname: "phone-user"},
		{UID: sourceUID, Nickname: "platform-user"},
		{UID: partnerUID, Nickname: "partner"},
	} {
		require.NoError(t, database.DB.Create(&user).Error)
	}
	require.NoError(t, database.DB.Create(&model.Couple{
		ID: coupleID, User1ID: sourceUID, User2ID: partnerUID, Status: "active",
	}).Error)
	require.NoError(t, createCoupleMembers(database.DB, model.Couple{
		ID: coupleID, User1ID: sourceUID, User2ID: partnerUID, Status: "active",
	}))

	require.NoError(t, NewAuthService(nil).BindPhone(context.Background(), sourceUID, phone))

	var member model.CoupleMember
	require.NoError(t, database.DB.First(&member, "couple_id = ? AND user_id = ?", coupleID, targetUID).Error)
	require.Equal(t, "active", member.Status)
	var sourceCount int64
	require.NoError(t, database.DB.Model(&model.CoupleMember{}).Where("user_id = ?", sourceUID).Count(&sourceCount).Error)
	require.Zero(t, sourceCount)
}
