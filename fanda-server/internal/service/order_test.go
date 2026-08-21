package service

import (
	"context"
	"errors"
	"testing"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

// setupOrderTestDB 构造订单、菜品、日历和菜篮子相关最小表结构，支撑订单服务单元测试。
func setupOrderTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	// stmts 是订单流程会触达的最小 schema，包含订单项、参与者和自动生成日历记录。
	stmts := []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT, dy_openid TEXT, phone TEXT, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
		`CREATE TABLE dishes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, table_id TEXT NOT NULL, dish_type TEXT NOT NULL, name TEXT NOT NULL, category TEXT, difficulty INTEGER, duration INTEGER, price REAL, ingredients TEXT, steps TEXT, photos TEXT, tags TEXT, restaurant TEXT, restaurant_note TEXT, source TEXT, is_deleted BOOLEAN, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE orders (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, table_id TEXT NOT NULL, dine_mode TEXT NOT NULL, status TEXT NOT NULL, total_amount REAL, vote_deadline DATETIME, calendar_record_id TEXT, created_at DATETIME)`,
		`CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, dish_id TEXT NOT NULL, quantity INTEGER, unit_price REAL, confirmed_amount REAL)`,
		`CREATE TABLE calendar_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, record_date DATETIME NOT NULL, meal_type TEXT NOT NULL, meal_period TEXT, dish_ids TEXT, restaurant TEXT, amount REAL, source TEXT, status TEXT NOT NULL, created_at DATETIME)`,
		`CREATE TABLE order_participants (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, user_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE shopping_baskets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, name TEXT NOT NULL, quantity TEXT, is_purchased BOOLEAN, created_at DATETIME)`,
	}
	for _, stmt := range stmts {
		require.NoError(t, db.Exec(stmt).Error)
	}
	return db
}

func TestCreateOrderCreatesSelectedBasketItems(t *testing.T) {
	// 测试意图：下单时选择的待采购项会写入菜篮子，并保持未购买状态。
	db := setupOrderTestDB(t)
	database.DB = db

	uid := uuid.New()
	tableID := uuid.New()
	dishID := uuid.New()
	price := 42.0
	// price 是菜品单价指针来源，既用于建菜品也用于下单明细，确保金额字段一致。

	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "personal", Name: "我的餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Dish{ID: dishID, OwnerID: uid, TableID: tableID, DishType: "dish", Name: "番茄牛腩", Price: &price}).Error)

	_, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID:  tableID,
		DineMode: "solo",
		Items: []OrderItemReq{{
			DishID:          dishID,
			Quantity:        1,
			ConfirmedAmount: &price,
		}},
		BasketItems: []OrderBasketItemReq{
			{Name: "牛腩", Quantity: "500g"},
			{Name: "番茄", Quantity: "3 个"},
		},
	})

	require.NoError(t, err)

	var baskets []model.ShoppingBasket
	require.NoError(t, db.Order("name ASC").Find(&baskets, "table_id = ?", tableID).Error)
	require.Len(t, baskets, 2)
	require.Equal(t, "牛腩", baskets[0].Name)
	require.Equal(t, "500g", baskets[0].Quantity)
	require.False(t, baskets[0].IsPurchased)
	require.Equal(t, "番茄", baskets[1].Name)
	require.Equal(t, "3 个", baskets[1].Quantity)
}

func TestCreateOrderCreatesCalendarRecord(t *testing.T) {
	// 测试意图：单人订单创建后立即确认，并同步生成一条日历记录。
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
			DishID:          dishID,
			Quantity:        2,
			ConfirmedAmount: &price,
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
	// 测试意图：多人一起吃订单保持 pending，创建参与者邀请，并生成 pending 日历记录。
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
			DishID:          dishID,
			Quantity:        1,
			ConfirmedAmount: &price,
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

func TestCreateOrderRejectsDishFromAnotherTable(t *testing.T) {
	// 测试意图：订单不能引用其他餐桌的菜品，防止跨餐桌越权下单。
	db := setupOrderTestDB(t)
	database.DB = db

	uid := uuid.New()
	tableA := uuid.New()
	tableB := uuid.New()
	dishFromTableB := uuid.New()
	price := 22.0

	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableA, Type: "personal", Name: "A 餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableB, Type: "personal", Name: "B 餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableA, UserID: uid, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableB, UserID: uid, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Dish{ID: dishFromTableB, OwnerID: uid, TableID: tableB, DishType: "dish", Name: "越界菜", Price: &price}).Error)

	_, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID:  tableA,
		DineMode: "solo",
		Items: []OrderItemReq{{
			DishID:          dishFromTableB,
			Quantity:        1,
			ConfirmedAmount: &price,
		}},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "菜品")
}

func TestCreateOrderRejectsDeletedDish(t *testing.T) {
	// 测试意图：已删除菜品不能再被下单引用。
	db := setupOrderTestDB(t)
	database.DB = db

	uid := uuid.New()
	tableID := uuid.New()
	dishID := uuid.New()
	price := 18.0

	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "personal", Name: "我的餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Dish{ID: dishID, OwnerID: uid, TableID: tableID, DishType: "dish", Name: "已删除菜", Price: &price, IsDeleted: true}).Error)

	_, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID:  tableID,
		DineMode: "solo",
		Items: []OrderItemReq{{
			DishID:          dishID,
			Quantity:        1,
			ConfirmedAmount: &price,
		}},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "菜品")
}

func TestCreateOrderUsesDishPriceAsReferenceSnapshot(t *testing.T) {
	_, uid, tableID, dishIDs := setupOrderAmountFixture(t, 20)
	confirmed := 55.0

	order, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{{DishID: dishIDs[0], Quantity: 3, ConfirmedAmount: &confirmed}},
	})

	require.NoError(t, err)
	require.Len(t, order.OrderItems, 1)
	require.NotNil(t, order.OrderItems[0].UnitPrice)
	require.Equal(t, 20.0, *order.OrderItems[0].UnitPrice)
}

func TestCreateOrderPersistsConfirmedAmountWithoutMultiplyingQuantity(t *testing.T) {
	db, uid, tableID, dishIDs := setupOrderAmountFixture(t, 20)
	confirmed := 55.0

	order, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{{DishID: dishIDs[0], Quantity: 3, ConfirmedAmount: &confirmed}},
	})

	require.NoError(t, err)
	require.NotNil(t, order.OrderItems[0].ConfirmedAmount)
	require.Equal(t, 55.0, *order.OrderItems[0].ConfirmedAmount)
	require.NotNil(t, order.TotalAmount)
	require.Equal(t, 55.0, *order.TotalAmount)
	var record model.CalendarRecord
	require.NoError(t, db.First(&record, "id = ?", *order.CalendarRecordID).Error)
	require.NotNil(t, record.Amount)
	require.Equal(t, 55.0, *record.Amount)
}

func TestCreateOrderAggregatesConfirmedAmounts(t *testing.T) {
	_, uid, tableID, dishIDs := setupOrderAmountFixture(t, 10.1, 2.2)
	first, second := 10.1, 2.2

	order, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{
			{DishID: dishIDs[0], Quantity: 1, ConfirmedAmount: &first},
			{DishID: dishIDs[1], Quantity: 4, ConfirmedAmount: &second},
		},
	})

	require.NoError(t, err)
	require.NotNil(t, order.TotalAmount)
	require.Equal(t, 12.3, *order.TotalAmount)
}

func TestCreateOrderKeepsAllNullAmountsNull(t *testing.T) {
	_, uid, tableID, dishIDs := setupOrderAmountFixture(t, 10)

	order, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{{DishID: dishIDs[0], Quantity: 1}},
	})

	require.NoError(t, err)
	require.Nil(t, order.TotalAmount)
	require.Nil(t, order.OrderItems[0].ConfirmedAmount)
}

func TestCreateOrderKeepsZeroAmountNonNull(t *testing.T) {
	_, uid, tableID, dishIDs := setupOrderAmountFixture(t, 10)
	zero := 0.0

	order, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{{DishID: dishIDs[0], Quantity: 1, ConfirmedAmount: &zero}},
	})

	require.NoError(t, err)
	require.NotNil(t, order.TotalAmount)
	require.Equal(t, 0.0, *order.TotalAmount)
}

func TestCreateOrderRejectsInvalidConfirmedAmount(t *testing.T) {
	tests := []struct {
		name   string
		amount float64
	}{
		{name: "negative", amount: -0.01},
		{name: "three decimals", amount: 12.345},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, uid, tableID, dishIDs := setupOrderAmountFixture(t, 10)
			_, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
				TableID: tableID, DineMode: "solo",
				Items: []OrderItemReq{{DishID: dishIDs[0], Quantity: 1, ConfirmedAmount: &tt.amount}},
			})
			require.Error(t, err)
			require.Contains(t, err.Error(), "确认金额无效")
		})
	}
}

func TestCreateOrderRejectsConfirmedAmountTotalAboveDatabaseLimit(t *testing.T) {
	db, uid, tableID, dishIDs := setupOrderAmountFixture(t, 10, 20)
	first, second := 60000000.0, 60000000.0

	_, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{
			{DishID: dishIDs[0], Quantity: 1, ConfirmedAmount: &first},
			{DishID: dishIDs[1], Quantity: 1, ConfirmedAmount: &second},
		},
	})

	require.Error(t, err)
	require.True(t, IsOrderRequestError(err))
	require.Contains(t, err.Error(), "99999999.99")
	var count int64
	require.NoError(t, db.Model(&model.Order{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestCreateOrderPreservesCreatorAuthorizationDatabaseError(t *testing.T) {
	db, uid, tableID, dishIDs := setupOrderAmountFixture(t, 10)
	require.NoError(t, db.Migrator().DropTable("table_members"))

	_, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{{DishID: dishIDs[0], Quantity: 1}},
	})

	require.Error(t, err)
	require.False(t, IsOrderRequestError(err))
	require.Contains(t, err.Error(), "table_members")
}

func TestCreateOrderMapsAuthorizationNotFoundToRequestError(t *testing.T) {
	_, _, tableID, dishIDs := setupOrderAmountFixture(t, 10)

	_, err := NewOrderService().CreateOrder(context.Background(), uuid.New(), CreateOrderReq{
		TableID: tableID, DineMode: "solo",
		Items: []OrderItemReq{{DishID: dishIDs[0], Quantity: 1}},
	})

	require.Error(t, err)
	require.True(t, IsOrderRequestError(err))
}

func TestCreateOrderPreservesParticipantAuthorizationDatabaseError(t *testing.T) {
	db, uid, tableID, dishIDs := setupOrderAmountFixture(t, 10)
	participantID := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: participantID, Nickname: "participant"}).Error)
	require.NoError(t, db.Create(&model.TableMember{
		ID: uuid.New(), TableID: tableID, UserID: participantID, Role: "member", Status: "active",
	}).Error)
	databaseErr := errors.New("forced participant authorization database failure")
	queryCount := 0
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("fail_participant_authorization", func(tx *gorm.DB) {
		if tx.Statement.Table != "table_members" {
			return
		}
		queryCount++
		if queryCount == 2 {
			tx.AddError(databaseErr)
		}
	}))

	_, err := NewOrderService().CreateOrder(context.Background(), uid, CreateOrderReq{
		TableID:        tableID,
		DineMode:       "together",
		ParticipantIDs: []uuid.UUID{participantID},
		Items:          []OrderItemReq{{DishID: dishIDs[0], Quantity: 1}},
	})

	require.ErrorIs(t, err, databaseErr)
	require.False(t, IsOrderRequestError(err))
}

func setupOrderAmountFixture(t *testing.T, prices ...float64) (*gorm.DB, uuid.UUID, uuid.UUID, []uuid.UUID) {
	t.Helper()
	db := setupOrderTestDB(t)
	database.DB = db
	uid, tableID := uuid.New(), uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "personal", Name: "金额餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active"}).Error)
	dishIDs := make([]uuid.UUID, 0, len(prices))
	for i := range prices {
		dishID := uuid.New()
		dishIDs = append(dishIDs, dishID)
		require.NoError(t, db.Create(&model.Dish{
			ID: dishID, OwnerID: uid, TableID: tableID, DishType: "dish",
			Name: "金额菜", Price: &prices[i],
		}).Error)
	}
	return db, uid, tableID, dishIDs
}

func TestConfirmOrderSyncsCalendarRecordAndParticipant(t *testing.T) {
	// 测试意图：参与者确认订单时，订单、日历记录和参与者状态三者同步更新。
	db := setupOrderTestDB(t)
	database.DB = db
	ctx := context.Background()
	_, participantID, order := createPendingOrderForStateTest(t, db)

	err := NewOrderService().ConfirmOrder(ctx, participantID, order.ID)

	require.NoError(t, err)
	assertOrderCalendarAndParticipantStatus(t, db, order.ID, *order.CalendarRecordID, participantID, "confirmed", "confirmed", "accepted")
}

func TestRejectOrderSyncsCalendarRecordAndParticipant(t *testing.T) {
	// 测试意图：参与者拒绝订单时，订单取消/拒绝链路同步反映到日历和参与者状态。
	db := setupOrderTestDB(t)
	database.DB = db
	ctx := context.Background()
	_, participantID, order := createPendingOrderForStateTest(t, db)

	err := NewOrderService().RejectOrder(ctx, participantID, order.ID)

	require.NoError(t, err)
	assertOrderCalendarAndParticipantStatus(t, db, order.ID, *order.CalendarRecordID, participantID, "rejected", "cancelled", "rejected")
}

func TestCancelOrderSyncsCalendarRecordAndParticipants(t *testing.T) {
	// 测试意图：创建者取消订单时，订单、日历记录和参与者状态同步为取消/跳过。
	db := setupOrderTestDB(t)
	database.DB = db
	ctx := context.Background()
	creatorID, participantID, order := createPendingOrderForStateTest(t, db)

	err := NewOrderService().CancelOrder(ctx, creatorID, order.ID)

	require.NoError(t, err)
	assertOrderCalendarAndParticipantStatus(t, db, order.ID, *order.CalendarRecordID, participantID, "cancelled", "cancelled", "skipped")
}

func createPendingOrderForStateTest(t *testing.T, db *gorm.DB) (uuid.UUID, uuid.UUID, *model.Order) {
	t.Helper()

	// creatorID/participantID/tableID/dishID 组成一笔待确认多人订单的最小业务上下文。
	creatorID := uuid.New()
	participantID := uuid.New()
	tableID := uuid.New()
	dishID := uuid.New()
	price := 28.0

	require.NoError(t, db.Create(&model.User{UID: creatorID, Nickname: "creator"}).Error)
	require.NoError(t, db.Create(&model.User{UID: participantID, Nickname: "member"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "buddy", Name: "状态餐桌", OwnerID: creatorID, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: creatorID, Role: "owner", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: participantID, Role: "member", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Dish{ID: dishID, OwnerID: creatorID, TableID: tableID, DishType: "dish", Name: "状态菜", Price: &price}).Error)

	order, err := NewOrderService().CreateOrder(context.Background(), creatorID, CreateOrderReq{
		TableID:        tableID,
		DineMode:       "together",
		ParticipantIDs: []uuid.UUID{participantID},
		Items: []OrderItemReq{{
			DishID:          dishID,
			Quantity:        1,
			ConfirmedAmount: &price,
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "pending", order.Status)
	require.NotNil(t, order.CalendarRecordID)
	return creatorID, participantID, order
}

func assertOrderCalendarAndParticipantStatus(t *testing.T, db *gorm.DB, orderID, recordID, participantID uuid.UUID, orderStatus, recordStatus, participantStatus string) {
	t.Helper()

	// 关键断言：同一订单状态变更必须同时落到 orders、calendar_records 和 order_participants。
	var persistedOrder model.Order
	require.NoError(t, db.First(&persistedOrder, "id = ?", orderID).Error)
	require.Equal(t, orderStatus, persistedOrder.Status)

	var record model.CalendarRecord
	require.NoError(t, db.First(&record, "id = ?", recordID).Error)
	require.Equal(t, recordStatus, record.Status)

	var participant model.OrderParticipant
	require.NoError(t, db.First(&participant, "order_id = ? AND user_id = ?", orderID, participantID).Error)
	require.Equal(t, participantStatus, participant.Status)
}
