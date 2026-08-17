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
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
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
