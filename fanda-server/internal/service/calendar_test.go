package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateManualRecordAllowsAmount(t *testing.T) {
	db, uid, recordID, _, _ := setupCalendarAmountFixture(t, "manual")
	amount := 23.45

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		Amount: OptionalAmount{Set: true, Value: &amount},
	})

	require.NoError(t, err)
	var record model.CalendarRecord
	require.NoError(t, db.First(&record, "id = ?", recordID).Error)
	require.NotNil(t, record.Amount)
	require.Equal(t, amount, *record.Amount)
}

func TestUpdateManualRecordRejectsOrderItems(t *testing.T) {
	_, uid, recordID, _, itemIDs := setupCalendarAmountFixture(t, "manual")
	amount := 12.0
	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{{
			ID: itemIDs[0], ConfirmedAmount: OptionalAmount{Set: true, Value: &amount},
		}},
	})
	require.EqualError(t, err, "手工记录不能提交订单项金额")
}

func TestUpdateOrderRecordRejectsDirectAmount(t *testing.T) {
	_, uid, recordID, _, _ := setupCalendarAmountFixture(t, "order")
	amount := 12.0
	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		Amount: OptionalAmount{Set: true, Value: &amount},
	})
	require.EqualError(t, err, "订单来源记录不能直接修改本餐总金额")
}

func TestUpdateOrderRecordRecalculatesAllItems(t *testing.T) {
	db, uid, recordID, orderID, itemIDs := setupCalendarAmountFixture(t, "order")
	amount := 15.0

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{{
			ID: itemIDs[0], ConfirmedAmount: OptionalAmount{Set: true, Value: &amount},
		}},
	})

	require.NoError(t, err)
	requireStoredAmount(t, db, "order_items", itemIDs[0], "confirmed_amount", 15)
	requireStoredAmount(t, db, "order_items", itemIDs[1], "confirmed_amount", 20)
	requireStoredAmount(t, db, "orders", orderID, "total_amount", 35)
	requireStoredAmount(t, db, "calendar_records", recordID, "amount", 35)
}

func TestUpdateOrderRecordLocksOrderBeforeUpdatingAmounts(t *testing.T) {
	db, uid, recordID, _, itemIDs := setupCalendarAmountFixture(t, "order")
	sawOrderLock := false
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("observe_order_lock", func(tx *gorm.DB) {
		if tx.Statement.Table != "orders" {
			return
		}
		_, sawOrderLock = tx.Statement.Clauses["FOR"]
	}))
	amount := 15.0

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{{
			ID: itemIDs[0], ConfirmedAmount: OptionalAmount{Set: true, Value: &amount},
		}},
	})

	require.NoError(t, err)
	require.True(t, sawOrderLock, "读取关联订单时必须持有 FOR UPDATE 行锁")
}

func TestUpdateOrderRecordRejectsTotalAboveDatabaseLimit(t *testing.T) {
	db, uid, recordID, orderID, itemIDs := setupCalendarAmountFixture(t, "order")
	first, second := 60000000.0, 60000000.0

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{
			{ID: itemIDs[0], ConfirmedAmount: OptionalAmount{Set: true, Value: &first}},
			{ID: itemIDs[1], ConfirmedAmount: OptionalAmount{Set: true, Value: &second}},
		},
	})

	require.Error(t, err)
	require.Contains(t, err.Error(), "99999999.99")
	requireStoredAmount(t, db, "order_items", itemIDs[0], "confirmed_amount", 10)
	requireStoredAmount(t, db, "order_items", itemIDs[1], "confirmed_amount", 20)
	requireStoredAmount(t, db, "orders", orderID, "total_amount", 30)
	requireStoredAmount(t, db, "calendar_records", recordID, "amount", 30)
}

func TestUpdateRecordDistinguishesOmittedAndEmptyRestaurant(t *testing.T) {
	db, uid, recordID, _, _ := setupCalendarAmountFixture(t, "manual")
	require.NoError(t, db.Model(&model.CalendarRecord{}).Where("id = ?", recordID).
		Update("restaurant", "原餐厅").Error)

	var omitted UpdateRecordReq
	require.NoError(t, json.Unmarshal([]byte(`{}`), &omitted))
	require.NoError(t, NewCalendarService().UpdateRecord(context.Background(), uid, recordID, omitted))
	requireStoredRestaurant(t, db, recordID, "原餐厅")

	var empty UpdateRecordReq
	require.NoError(t, json.Unmarshal([]byte(`{"restaurant":""}`), &empty))
	require.NoError(t, NewCalendarService().UpdateRecord(context.Background(), uid, recordID, empty))
	requireStoredRestaurant(t, db, recordID, "")
}

func TestCreateManualRecordRejectsInvalidAmount(t *testing.T) {
	db := setupOrderTestDB(t)
	database.DB = db
	uid, tableID := uuid.New(), uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "calendar tester"}).Error)
	require.NoError(t, db.Create(&model.Table{
		ID: tableID, Type: "personal", Name: "日历餐桌", OwnerID: uid, Status: "active",
	}).Error)
	require.NoError(t, db.Create(&model.TableMember{
		ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active",
	}).Error)
	invalid := -0.01

	_, err := NewCalendarService().CreateRecord(context.Background(), uid, CreateRecordReq{
		TableID: tableID, RecordDate: "2026-08-21", MealType: "cook", Amount: &invalid,
	})

	require.EqualError(t, err, "金额不能小于 0")
	var count int64
	require.NoError(t, db.Model(&model.CalendarRecord{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestUpdateOrderRecordRejectsDuplicateItems(t *testing.T) {
	db, uid, recordID, orderID, itemIDs := setupCalendarAmountFixture(t, "order")
	first, second := 15.0, 25.0

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{
			{ID: itemIDs[0], ConfirmedAmount: OptionalAmount{Set: true, Value: &first}},
			{ID: itemIDs[0], ConfirmedAmount: OptionalAmount{Set: true, Value: &second}},
		},
	})

	require.EqualError(t, err, "请求包含重复订单项")
	requireStoredAmount(t, db, "order_items", itemIDs[0], "confirmed_amount", 10)
	requireStoredAmount(t, db, "orders", orderID, "total_amount", 30)
}

func TestUpdateOrderRecordRejectsMissingConfirmedAmount(t *testing.T) {
	db, uid, recordID, orderID, itemIDs := setupCalendarAmountFixture(t, "order")

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{{ID: itemIDs[0]}},
	})

	require.EqualError(t, err, "订单项确认金额不能为空")
	requireStoredAmount(t, db, "order_items", itemIDs[0], "confirmed_amount", 10)
	requireStoredAmount(t, db, "orders", orderID, "total_amount", 30)
}

func TestUpdateOrderRecordRejectsForeignItem(t *testing.T) {
	db, uid, recordID, _, _ := setupCalendarAmountFixture(t, "order")
	foreignOrderID, foreignItemID := uuid.New(), uuid.New()
	require.NoError(t, db.Create(&model.Order{
		ID: foreignOrderID, CreatorID: uid, TableID: uuid.New(), DineMode: "solo", Status: "confirmed",
	}).Error)
	require.NoError(t, db.Create(&model.OrderItem{
		ID: foreignItemID, OrderID: foreignOrderID, DishID: uuid.New(), Quantity: 1,
	}).Error)
	amount := 99.0

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{{
			ID: foreignItemID, ConfirmedAmount: OptionalAmount{Set: true, Value: &amount},
		}},
	})

	require.EqualError(t, err, "请求包含无效订单项")
}

func TestUpdateOrderRecordRollsBackAllAmounts(t *testing.T) {
	db, uid, recordID, orderID, itemIDs := setupCalendarAmountFixture(t, "order")
	require.NoError(t, db.Exec(`
		CREATE TRIGGER fail_calendar_amount
		BEFORE UPDATE OF amount ON calendar_records
		BEGIN
			SELECT RAISE(FAIL, 'forced calendar update failure');
		END
	`).Error)
	amount := 15.0

	err := NewCalendarService().UpdateRecord(context.Background(), uid, recordID, UpdateRecordReq{
		OrderItems: []UpdateOrderItemAmountReq{{
			ID: itemIDs[0], ConfirmedAmount: OptionalAmount{Set: true, Value: &amount},
		}},
	})

	require.Error(t, err)
	requireStoredAmount(t, db, "order_items", itemIDs[0], "confirmed_amount", 10)
	requireStoredAmount(t, db, "orders", orderID, "total_amount", 30)
	requireStoredAmount(t, db, "calendar_records", recordID, "amount", 30)
}

func TestGetRecordIncludesOrderItems(t *testing.T) {
	_, uid, recordID, orderID, itemIDs := setupCalendarAmountFixture(t, "order")

	detail, err := NewCalendarService().GetRecord(context.Background(), uid, recordID)

	require.NoError(t, err)
	require.NotNil(t, detail.Order)
	require.Equal(t, orderID, detail.Order.ID)
	require.Len(t, detail.Order.Items, 2)
	itemsByID := make(map[uuid.UUID]CalendarOrderItemDetail, len(detail.Order.Items))
	for _, item := range detail.Order.Items {
		itemsByID[item.ID] = item
	}
	require.Equal(t, "测试菜 1", itemsByID[itemIDs[0]].DishName)
	require.Equal(t, 10.0, *itemsByID[itemIDs[0]].ConfirmedAmount)
}

func TestGetRecordKeepsOrderItemWhenDishIsMissing(t *testing.T) {
	db, uid, recordID, _, itemIDs := setupCalendarAmountFixture(t, "order")
	var item model.OrderItem
	require.NoError(t, db.First(&item, "id = ?", itemIDs[0]).Error)
	require.NoError(t, db.Delete(&model.Dish{}, "id = ?", item.DishID).Error)

	detail, err := NewCalendarService().GetRecord(context.Background(), uid, recordID)

	require.NoError(t, err)
	require.NotNil(t, detail.Order)
	require.Len(t, detail.Order.Items, 2)
}

func setupCalendarAmountFixture(t *testing.T, source string) (*gorm.DB, uuid.UUID, uuid.UUID, uuid.UUID, []uuid.UUID) {
	t.Helper()
	db := setupOrderTestDB(t)
	database.DB = db
	require.NoError(t, db.Exec(`CREATE TABLE record_photos (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, url TEXT NOT NULL, type TEXT, sort_order INTEGER)`).Error)
	require.NoError(t, db.Exec(`CREATE TABLE record_comments (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at DATETIME)`).Error)
	uid, tableID, recordID := uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "calendar tester"}).Error)
	require.NoError(t, db.Create(&model.Table{ID: tableID, Type: "personal", Name: "日历餐桌", OwnerID: uid, Status: "active"}).Error)
	require.NoError(t, db.Create(&model.TableMember{ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active"}).Error)
	initial := 30.0
	record := model.CalendarRecord{
		ID: recordID, UserID: uid, TableID: tableID, RecordDate: time.Now(),
		MealType: "cook", Source: source, Status: "confirmed", Amount: &initial,
	}
	require.NoError(t, db.Create(&record).Error)
	if source != "order" {
		return db, uid, recordID, uuid.Nil, []uuid.UUID{uuid.New()}
	}

	orderID := uuid.New()
	require.NoError(t, db.Create(&model.Order{
		ID: orderID, CreatorID: uid, TableID: tableID, DineMode: "solo", Status: "confirmed",
		TotalAmount: &initial, CalendarRecordID: &recordID,
	}).Error)
	itemIDs := []uuid.UUID{uuid.New(), uuid.New()}
	for i, amount := range []float64{10, 20} {
		dishID := uuid.New()
		name := "测试菜 " + string(rune('1'+i))
		require.NoError(t, db.Create(&model.Dish{
			ID: dishID, OwnerID: uid, TableID: tableID, DishType: "dish", Name: name,
		}).Error)
		require.NoError(t, db.Create(&model.OrderItem{
			ID: itemIDs[i], OrderID: orderID, DishID: dishID, Quantity: i + 1,
			ConfirmedAmount: amountPtr(amount),
		}).Error)
	}
	return db, uid, recordID, orderID, itemIDs
}

func requireStoredAmount(t *testing.T, db *gorm.DB, table string, id uuid.UUID, column string, want float64) {
	t.Helper()
	var got float64
	require.NoError(t, db.Table(table).Select(column).Where("id = ?", id).Scan(&got).Error)
	require.Equal(t, want, got)
}

func requireStoredRestaurant(t *testing.T, db *gorm.DB, id uuid.UUID, want string) {
	t.Helper()
	var got string
	require.NoError(t, db.Model(&model.CalendarRecord{}).Select("restaurant").
		Where("id = ?", id).Scan(&got).Error)
	require.Equal(t, want, got)
}
