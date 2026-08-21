package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreateRecordMapsAmountValidationErrorToBadRequest(t *testing.T) {
	db, uid, tableID := setupCalendarHandlerTestDB(t)
	database.DB = db

	response := performCreateRecord(t, uid, tableID, -0.01)

	require.Equal(t, http.StatusBadRequest, response.Code)
	require.Equal(t, float64(http.StatusBadRequest), responseBody(t, response)["code"])
}

func TestCreateRecordKeepsDatabaseErrorAsInternalServerError(t *testing.T) {
	db, uid, tableID := setupCalendarHandlerTestDB(t)
	database.DB = db

	response := performCreateRecord(t, uid, tableID, 12.34)

	require.Equal(t, http.StatusInternalServerError, response.Code)
	require.Equal(t, float64(http.StatusInternalServerError), responseBody(t, response)["code"])
}

func TestCreateRecordMapsInvalidDateToBadRequest(t *testing.T) {
	db, uid, tableID := setupCalendarHandlerTestDB(t)
	database.DB = db

	response := performCreateRecordWithDate(t, uid, tableID, "2026-02-30", 12.34)

	require.Equal(t, http.StatusBadRequest, response.Code)
	require.Equal(t, float64(http.StatusBadRequest), responseBody(t, response)["code"])
}

func TestCreateRecordHidesInaccessibleTableAsNotFound(t *testing.T) {
	db, uid, tableID := setupCalendarHandlerTestDB(t)
	database.DB = db
	require.NoError(t, db.Where("table_id = ? AND user_id = ?", tableID, uid).Delete(&model.TableMember{}).Error)

	response := performCreateRecord(t, uid, tableID, 12.34)

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Equal(t, float64(http.StatusNotFound), responseBody(t, response)["code"])
}

func TestUpdateRecordKeepsDatabaseErrorAsInternalServerError(t *testing.T) {
	db, uid, _ := setupCalendarHandlerTestDB(t)
	database.DB = db

	response := performUpdateRecord(t, uid, uuid.New(), `{"meal_type":"takeout"}`)

	require.Equal(t, http.StatusInternalServerError, response.Code)
	require.Equal(t, float64(http.StatusInternalServerError), responseBody(t, response)["code"])
}

func TestGetRecordKeepsLinkedOrderDatabaseErrorAsInternalServerError(t *testing.T) {
	db, uid, tableID := setupCalendarGetRecordTestDB(t)
	database.DB = db
	recordID := createOrderCalendarRecord(t, db, uid, tableID, false)
	require.NoError(t, db.Exec("DROP TABLE orders").Error)

	response := performGetRecord(uid, recordID)

	require.Equal(t, http.StatusInternalServerError, response.Code)
	require.Equal(t, float64(http.StatusInternalServerError), responseBody(t, response)["code"])
}

func TestGetRecordMapsMissingLinkedOrderToNotFound(t *testing.T) {
	db, uid, tableID := setupCalendarGetRecordTestDB(t)
	database.DB = db
	recordID := createOrderCalendarRecord(t, db, uid, tableID, false)

	response := performGetRecord(uid, recordID)

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Equal(t, float64(http.StatusNotFound), responseBody(t, response)["code"])
}

func TestGetRecordKeepsLinkedOrderItemDatabaseErrorAsInternalServerError(t *testing.T) {
	db, uid, tableID := setupCalendarGetRecordTestDB(t)
	database.DB = db
	recordID := createOrderCalendarRecord(t, db, uid, tableID, true)
	require.NoError(t, db.Exec("DROP TABLE order_items").Error)

	response := performGetRecord(uid, recordID)

	require.Equal(t, http.StatusInternalServerError, response.Code)
	require.Equal(t, float64(http.StatusInternalServerError), responseBody(t, response)["code"])
}

func TestGetRecordMapsMissingLinkedOrderItemsToNotFound(t *testing.T) {
	db, uid, tableID := setupCalendarGetRecordTestDB(t)
	database.DB = db
	recordID := createOrderCalendarRecord(t, db, uid, tableID, true)

	response := performGetRecord(uid, recordID)

	require.Equal(t, http.StatusNotFound, response.Code)
	require.Equal(t, float64(http.StatusNotFound), responseBody(t, response)["code"])
}

func setupCalendarHandlerTestDB(t *testing.T) (*gorm.DB, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	for _, stmt := range []string{
		`CREATE TABLE users (uid TEXT PRIMARY KEY, wx_openid TEXT, dy_openid TEXT, phone TEXT, nickname TEXT NOT NULL, avatar TEXT, points INTEGER, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL, created_at DATETIME, updated_at DATETIME)`,
		`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
	} {
		require.NoError(t, db.Exec(stmt).Error)
	}
	uid, tableID := uuid.New(), uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "handler tester"}).Error)
	require.NoError(t, db.Create(&model.Table{
		ID: tableID, Type: "personal", Name: "handler table", OwnerID: uid, Status: "active",
	}).Error)
	require.NoError(t, db.Create(&model.TableMember{
		ID: uuid.New(), TableID: tableID, UserID: uid, Role: "owner", Status: "active",
	}).Error)
	return db, uid, tableID
}

func setupCalendarGetRecordTestDB(t *testing.T) (*gorm.DB, uuid.UUID, uuid.UUID) {
	t.Helper()
	db, uid, tableID := setupCalendarHandlerTestDB(t)
	for _, stmt := range []string{
		`CREATE TABLE calendar_records (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, table_id TEXT NOT NULL, record_date DATETIME NOT NULL, meal_type TEXT NOT NULL, meal_period TEXT, dish_ids TEXT, restaurant TEXT, amount REAL, source TEXT, status TEXT NOT NULL, created_at DATETIME)`,
		`CREATE TABLE record_photos (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, url TEXT NOT NULL, type TEXT, sort_order INTEGER)`,
		`CREATE TABLE record_comments (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, user_id TEXT NOT NULL, content TEXT NOT NULL, created_at DATETIME)`,
		`CREATE TABLE orders (id TEXT PRIMARY KEY, creator_id TEXT NOT NULL, table_id TEXT NOT NULL, dine_mode TEXT NOT NULL, status TEXT NOT NULL, total_amount REAL, vote_deadline DATETIME, calendar_record_id TEXT, created_at DATETIME)`,
		`CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, dish_id TEXT NOT NULL, quantity INTEGER, unit_price REAL, confirmed_amount REAL)`,
		`CREATE TABLE dishes (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, table_id TEXT NOT NULL, dish_type TEXT NOT NULL, name TEXT NOT NULL, category TEXT, difficulty INTEGER, duration INTEGER, price REAL, ingredients TEXT, steps TEXT, photos TEXT, tags TEXT, restaurant TEXT, restaurant_note TEXT, source TEXT, is_deleted BOOLEAN, created_at DATETIME, updated_at DATETIME)`,
	} {
		require.NoError(t, db.Exec(stmt).Error)
	}
	return db, uid, tableID
}

func createOrderCalendarRecord(t *testing.T, db *gorm.DB, uid, tableID uuid.UUID, withOrder bool) uuid.UUID {
	t.Helper()
	recordID := uuid.New()
	require.NoError(t, db.Create(&model.CalendarRecord{
		ID: recordID, UserID: uid, TableID: tableID, RecordDate: time.Now(),
		MealType: "cook", Source: "order", Status: "confirmed",
	}).Error)
	if withOrder {
		require.NoError(t, db.Create(&model.Order{
			ID: uuid.New(), CreatorID: uid, TableID: tableID, DineMode: "solo",
			Status: "confirmed", CalendarRecordID: &recordID,
		}).Error)
	}
	return recordID
}

func performCreateRecord(t *testing.T, uid, tableID uuid.UUID, amount float64) *httptest.ResponseRecorder {
	t.Helper()
	return performCreateRecordWithDate(t, uid, tableID, "2026-08-21", amount)
}

func performCreateRecordWithDate(t *testing.T, uid, tableID uuid.UUID, recordDate string, amount float64) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	body := fmt.Sprintf(
		`{"table_id":%q,"record_date":%q,"meal_type":"cook","amount":%v}`,
		tableID.String(),
		recordDate,
		amount,
	)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Set("uid", uid)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/calendar/records", bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")

	NewCalendarHandler().CreateRecord(c)
	return response
}

func performUpdateRecord(t *testing.T, uid, recordID uuid.UUID, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Set("uid", uid)
	c.Params = gin.Params{{Key: "id", Value: recordID.String()}}
	c.Request = httptest.NewRequest(http.MethodPut, "/api/v1/calendar/records/"+recordID.String(), bytes.NewBufferString(body))
	c.Request.Header.Set("Content-Type", "application/json")

	NewCalendarHandler().UpdateRecord(c)
	return response
}

func performGetRecord(uid, recordID uuid.UUID) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Set("uid", uid)
	c.Params = gin.Params{{Key: "id", Value: recordID.String()}}
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/calendar/records/"+recordID.String(), nil)

	NewCalendarHandler().GetRecord(c)
	return response
}

func responseBody(t *testing.T, response *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
	return body
}
