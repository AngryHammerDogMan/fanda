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

func setupOrderTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT, dy_openid TEXT, phone TEXT, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
		`CREATE TABLE dishes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, table_id TEXT NOT NULL, dish_type TEXT NOT NULL, name TEXT NOT NULL, category TEXT, difficulty INTEGER, duration INTEGER, price REAL, ingredients TEXT, steps TEXT, photos TEXT, tags TEXT, restaurant TEXT, restaurant_note TEXT, source TEXT, is_deleted BOOLEAN, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE orders (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, table_id TEXT NOT NULL, dine_mode TEXT NOT NULL, status TEXT NOT NULL, total_amount REAL, vote_deadline DATETIME, calendar_record_id TEXT, created_at DATETIME)`,
		`CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, dish_id TEXT NOT NULL, quantity INTEGER, unit_price REAL)`,
		`CREATE TABLE calendar_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, record_date DATETIME NOT NULL, meal_type TEXT NOT NULL, meal_period TEXT, dish_ids TEXT, restaurant TEXT, amount REAL, source TEXT, status TEXT NOT NULL, created_at DATETIME)`,
		`CREATE TABLE order_participants (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
	}
	for _, stmt := range stmts {
		require.NoError(t, db.Exec(stmt).Error)
	}
	return db
}

func TestCreateOrderCreatesCalendarRecord(t *testing.T) {
	db := setupOrderTestDB(t)
	database.DB = db

	uid := uuid.New()
	tableID := uuid.New()
	dishID := uuid.New()
	price := 12.5

	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "personal", Name: "我的餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Dish{ID: dishID, OwnerID: uid, TableID: tableID, DishType: "dish", Name: "番茄牛腩", Price: &price}).Error)

	svc := NewOrderService()
	order, err := svc.CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID:  tableID,
		DineMode: "solo",
		Items: []OrderItemReq{{
			DishID:    dishID,
			Quantity:  2,
			UnitPrice: &price,
		}},
	})

	require.NoError(t, err)
	require.Equal(t, "confirmed", order.Status)
	require.NotNil(t, order.CalendarRecordID)

	var count int64
	require.NoError(t, db.Model(&model.CalendarRecord{}).Where("id = ?", *order.CalendarRecordID).Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func TestCreateTogetherOrderCreatesParticipants(t *testing.T) {
	db := setupOrderTestDB(t)
	database.DB = db

	uid := uuid.New()
	participantID := uuid.New()
	tableID := uuid.New()
	dishID := uuid.New()
	price := 18.0

	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "creator"}).Error)
	require.NoError(t, db.Create(&model.User{UID: participantID, Nickname: "member"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "buddy", Name: "周末饭搭局", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: participantID, Role: "member", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Dish{ID: dishID, OwnerID: uid, TableID: tableID, DishType: "dish", Name: "咖喱鸡", Price: &price}).Error)

	order, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID:        tableID,
		DineMode:       "together",
		ParticipantIDs: []uuid.UUID{participantID},
		Items: []OrderItemReq{{
			DishID:    dishID,
			Quantity:  1,
			UnitPrice: &price,
		}},
	})

	require.NoError(t, err)
	require.Equal(t, "pending", order.Status)
	require.NotNil(t, order.CalendarRecordID)

	var participant model.OrderParticipant
	require.NoError(t, db.First(&participant, "order_id = ? AND user_id = ?", order.ID, participantID).Error)
	require.Equal(t, "invited", participant.Status)

	var record model.CalendarRecord
	require.NoError(t, db.First(&record, "id = ?", *order.CalendarRecordID).Error)
	require.Equal(t, "pending", record.Status)
}
