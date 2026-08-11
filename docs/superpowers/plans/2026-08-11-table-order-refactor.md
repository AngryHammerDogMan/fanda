# Table Order Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor Fanda from `couple / buddy` group-scoped ordering into a unified `tables` model, make ordering the primary bottom-tab flow, and create both `order` and `calendar_record` on successful checkout.

**Architecture:** Introduce `tables` and `table_members` as the ownership and authorization boundary, then migrate dishes, orders, calendar records, wishes, basket, and budget toward `table_id`. The backend owns all order/calendar dual-write logic in one transaction; the frontend renders an external food-delivery style ordering page that only works with selected tables.

**Tech Stack:** Go + Gin + GORM + PostgreSQL, Taro 4 + React 18 + TypeScript + Sass, H5 preview mocks, existing root `npm start` workflow.

---

## Scope note

This is a product-model refactor across documents, database, backend, frontend, and UI artifacts. Implement it in stages with a commit after each task. Do not edit all layers in one unreviewed batch.

## Files and responsibilities

- `docs/superpowers/specs/2026-08-11-table-order-refactor-design.md`: Approved design source of truth.
- `README.md`: Update project positioning and feature list from “情侣和饭搭子点菜” to “餐桌点单”.
- `couple-menu-prd/couple-menu-prd.html`: Product PRD artifact; update visible product model and flow copy.
- `tech-plan/tech-plan.html`: Technical plan artifact; update model diagrams and API descriptions.
- `fanda-hi-fi-ui-design/fanda-hi-fi-ui-design.html`: UI artifact; update bottom nav and ordering screens.
- `fanda-server/migrations/003_tables_refactor.sql`: Add tables, members, participants, table IDs, and indexes.
- `fanda-server/internal/model/table.go`: New GORM table and member models.
- `fanda-server/internal/model/dish.go`: Replace group ownership fields with `TableID`.
- `fanda-server/internal/model/order.go`: Replace group ownership fields with `TableID`, add participants, record status.
- `fanda-server/internal/model/feature.go`: Move wishes, basket, and budget to `TableID`.
- `fanda-server/internal/service/table.go`: New table query, default provisioning, rename, and member helpers.
- `fanda-server/internal/service/authz.go`: Add `CanAccessTable`; keep old helpers only as compatibility wrappers while migrating.
- `fanda-server/internal/service/dish.go`: Query and mutate dishes by table.
- `fanda-server/internal/service/order.go`: Create orders and calendar records in one transaction.
- `fanda-server/internal/service/calendar.go`: Query records by table and status.
- `fanda-server/internal/service/feature.go`: Move basket/wishes/budget to table IDs.
- `fanda-server/internal/handler/table.go`: New `/tables` API.
- `fanda-server/internal/handler/dish.go`, `order.go`, `calendar.go`, `feature.go`: Accept `table_id` request params and payloads.
- `fanda-server/internal/router/router.go`: Register table routes and keep existing routes where needed.
- `fanda-app/src/types/index.ts`: Add `Table`, `TableMember`, `OrderParticipant`; migrate payloads to `table_id`.
- `fanda-app/src/services/api.ts`: Add `tableAPI`, update mocks and table-scoped endpoints.
- `fanda-app/src/app.config.ts`: Bottom nav becomes 首页 / 点单 / 日历 / 我的.
- `fanda-app/src/pages/orders/create.tsx`: Rebuild as the main ordering tab page.
- `fanda-app/src/pages/orders/create.scss`: External food-delivery style ordering layout.
- `fanda-app/src/pages/index/index.tsx`: Move menu management entry to home.
- `fanda-app/src/pages/dishes/index.tsx`: Treat as table-scoped menu management, no longer a bottom tab.
- `fanda-app/src/pages/calendar/index.tsx`: Read records by selected table.
- `scripts/*.test.js`: Update static checks if they assume old group-only API.

---

### Task 1: Update public project documentation

**Files:**
- Modify: `README.md`
- Modify: `couple-menu-prd/couple-menu-prd.html`
- Modify: `tech-plan/tech-plan.html`
- Modify: `fanda-hi-fi-ui-design/fanda-hi-fi-ui-design.html`

- [ ] **Step 1: Update README feature language**

Replace the current tagline and feature list with wording that matches the approved table model.

Use this exact copy in `README.md`:

```markdown
# 🍽️ 饭搭 (Fanda)

> 围绕个人、情侣和饭搭餐桌的菜单管理与点单小程序 —— 先选想吃什么，再决定自己记录还是一起吃。
```

Replace the feature list under `## 功能特性` with:

```markdown
- 🍽️ **餐桌模型** — 支持个人餐桌、情侣餐桌和饭搭餐桌，菜单、点单、日历和预算都按餐桌管理
- 🧾 **快捷点单** — 底部主入口直接进入点单页，外卖式选菜、购物车和提交体验
- 👥 **一起吃邀请** — 多人餐桌可邀请成员一起吃，个人餐桌直接自己记一餐
- 🍳 **菜单管理** — 管理自做菜、外卖和外食灵感，并支持按餐桌切换
- 📅 **用餐日历** — 下单成功后同步生成日历记录，订单和日历分开展示
- 🛠️ **后台管理** — 数据仪表盘，用户、菜单、订单和用餐记录管理
```

- [ ] **Step 2: Update HTML artifact titles and key visible copy**

In each HTML artifact, search visible copy for old phrases:

```text
情侣菜单
情侣关系
饭搭子组合
新建点单
菜单 Tab
```

Replace user-facing copy with:

```text
餐桌
我的餐桌
情侣餐桌
饭搭餐桌
开始点单
点单 Tab
菜单管理
```

Keep file names unchanged for now to avoid breaking existing workspace references.

- [ ] **Step 3: Verify old public copy is removed**

Run:

```bash
grep -R "情侣菜单\\|菜单 Tab\\|新建点单" README.md couple-menu-prd tech-plan fanda-hi-fi-ui-design
```

Expected: no remaining user-facing matches. Matches in historical file names are acceptable; visible copy must be removed.

- [ ] **Step 4: Commit**

```bash
git add README.md couple-menu-prd/couple-menu-prd.html tech-plan/tech-plan.html fanda-hi-fi-ui-design/fanda-hi-fi-ui-design.html
git commit -m "docs: update table ordering product model"
```

---

### Task 2: Add database migration for tables

**Files:**
- Create: `fanda-server/migrations/003_tables_refactor.sql`

- [ ] **Step 1: Create migration**

Create `fanda-server/migrations/003_tables_refactor.sql` with:

```sql
-- 餐桌模型与点单流程重构

CREATE TABLE IF NOT EXISTS tables (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(10) NOT NULL CHECK (type IN ('personal', 'couple', 'buddy')),
    name        VARCHAR(50) NOT NULL,
    owner_id    UUID NOT NULL REFERENCES users(uid),
    status      VARCHAR(15) NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tables_owner ON tables(owner_id);
CREATE INDEX IF NOT EXISTS idx_tables_type ON tables(type);

CREATE TABLE IF NOT EXISTS table_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id    UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    role        VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    status      VARCHAR(15) NOT NULL DEFAULT 'active',
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_table_member_unique ON table_members(table_id, user_id);
CREATE INDEX IF NOT EXISTS idx_table_members_user ON table_members(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_owned_personal_table_per_user
ON tables(owner_id)
WHERE type = 'personal' AND status = 'active';

-- PostgreSQL 的部分索引条件不能引用另一张表，因此“每个用户只能加入一个情侣餐桌”
-- 由 TableService 在创建或绑定情侣餐桌时通过事务校验 table_members 实现。

ALTER TABLE dishes ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE calendar_records ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE calendar_records ADD COLUMN IF NOT EXISTS status VARCHAR(15) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled'));
ALTER TABLE wish_items ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE basket_items ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);

CREATE TABLE IF NOT EXISTS order_participants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    status      VARCHAR(15) NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited', 'accepted', 'rejected', 'skipped')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_participant_unique ON order_participants(order_id, user_id);
CREATE INDEX IF NOT EXISTS idx_order_participants_user ON order_participants(user_id);

INSERT INTO tables (id, type, name, owner_id, status, created_at, updated_at)
SELECT gen_random_uuid(), 'personal', '我的餐桌', users.uid, 'active', NOW(), NOW()
FROM users
WHERE NOT EXISTS (
    SELECT 1
    FROM tables t
    JOIN table_members tm ON tm.table_id = t.id
    WHERE t.type = 'personal'
      AND t.status = 'active'
      AND tm.user_id = users.uid
      AND tm.status = 'active'
);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT t.id, t.owner_id, 'owner', 'active', NOW()
FROM tables t
WHERE t.type = 'personal'
  AND NOT EXISTS (
      SELECT 1 FROM table_members tm WHERE tm.table_id = t.id AND tm.user_id = t.owner_id
  );

INSERT INTO tables (id, type, name, owner_id, status, created_at, updated_at)
SELECT couples.id, 'couple', '情侣餐桌', couples.user1_id, couples.status, couples.created_at, NOW()
FROM couples
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE tables.id = couples.id);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT couples.id, couples.user1_id, 'owner', couples.status, couples.created_at
FROM couples
WHERE NOT EXISTS (
    SELECT 1 FROM table_members WHERE table_members.table_id = couples.id AND table_members.user_id = couples.user1_id
);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT couples.id, couples.user2_id, 'member', couples.status, couples.created_at
FROM couples
WHERE NOT EXISTS (
    SELECT 1 FROM table_members WHERE table_members.table_id = couples.id AND table_members.user_id = couples.user2_id
);

INSERT INTO tables (id, type, name, owner_id, status, created_at, updated_at)
SELECT buddy_groups.id, 'buddy', buddy_groups.name, buddy_groups.owner_id, buddy_groups.status, buddy_groups.created_at, buddy_groups.updated_at
FROM buddy_groups
WHERE NOT EXISTS (SELECT 1 FROM tables WHERE tables.id = buddy_groups.id);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT buddy_members.group_id, buddy_members.user_id, buddy_members.role, 'active', buddy_members.joined_at
FROM buddy_members
WHERE NOT EXISTS (
    SELECT 1 FROM table_members
    WHERE table_members.table_id = buddy_members.group_id
      AND table_members.user_id = buddy_members.user_id
);

UPDATE dishes
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables WHERE tables.id = dishes.group_id);

UPDATE orders
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables WHERE tables.id = orders.group_id);

UPDATE calendar_records
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables WHERE tables.id = calendar_records.group_id);

UPDATE wish_items
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables WHERE tables.id = wish_items.group_id);

UPDATE basket_items
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables WHERE tables.id = basket_items.group_id);

UPDATE budget_settings
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables WHERE tables.id = budget_settings.group_id);

CREATE INDEX IF NOT EXISTS idx_dishes_table ON dishes(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_calendar_table ON calendar_records(table_id, record_date);
CREATE INDEX IF NOT EXISTS idx_wish_table ON wish_items(table_id);
CREATE INDEX IF NOT EXISTS idx_basket_table ON basket_items(table_id);
CREATE INDEX IF NOT EXISTS idx_budget_table ON budget_settings(table_id);
```

- [ ] **Step 2: Run migration syntax check**

Run:

```bash
psql -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

Expected: migration applies without SQL errors. If no local database is available, record this as blocked and continue with code-level tests.

- [ ] **Step 3: Commit**

```bash
git add fanda-server/migrations/003_tables_refactor.sql
git commit -m "feat(server): add table refactor migration"
```

---

### Task 3: Add backend table models and authorization

**Files:**
- Create: `fanda-server/internal/model/table.go`
- Modify: `fanda-server/internal/service/authz.go`
- Test: `fanda-server/internal/service/authz_test.go`

- [ ] **Step 1: Write failing authorization test**

Add this test to `fanda-server/internal/service/authz_test.go`:

```go
func TestCanAccessTableAllowsActiveMember(t *testing.T) {
	db := setupAuthzTestDB(t)
	database.DB = db

	uid := uuid.New()
	tableID := uuid.New()

	require.NoError(t, db.Exec(`INSERT INTO users (uid, nickname) VALUES (?, ?)`, uid, "tester").Error)
	require.NoError(t, db.Exec(`INSERT INTO tables (id, type, name, owner_id, status) VALUES (?, ?, ?, ?, ?)`, tableID, "personal", "我的餐桌", uid, "active").Error)
	require.NoError(t, db.Exec(`INSERT INTO table_members (id, table_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)`, uuid.New(), tableID, uid, "owner", "active").Error)

	require.NoError(t, CanAccessTable(context.Background(), uid, tableID))
}

func TestCanAccessTableRejectsNonMember(t *testing.T) {
	db := setupAuthzTestDB(t)
	database.DB = db

	ownerID := uuid.New()
	otherID := uuid.New()
	tableID := uuid.New()

	require.NoError(t, db.Exec(`INSERT INTO users (uid, nickname) VALUES (?, ?)`, ownerID, "owner").Error)
	require.NoError(t, db.Exec(`INSERT INTO users (uid, nickname) VALUES (?, ?)`, otherID, "other").Error)
	require.NoError(t, db.Exec(`INSERT INTO tables (id, type, name, owner_id, status) VALUES (?, ?, ?, ?, ?)`, tableID, "personal", "我的餐桌", ownerID, "active").Error)
	require.NoError(t, db.Exec(`INSERT INTO table_members (id, table_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)`, uuid.New(), tableID, ownerID, "owner", "active").Error)

	require.Error(t, CanAccessTable(context.Background(), otherID, tableID))
}
```

Update the test schema helper to include:

```go
`CREATE TABLE tables (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL)`,
`CREATE TABLE table_members (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, joined_at DATETIME)`,
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/service -run TestCanAccessTable -v
```

Expected: FAIL with `undefined: CanAccessTable`.

- [ ] **Step 3: Add table models**

Create `fanda-server/internal/model/table.go`:

```go
package model

import (
	"time"

	"github.com/google/uuid"
)

type Table struct {
	ID        uuid.UUID     `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Type      string        `gorm:"type:varchar(10);not null;index" json:"type"`
	Name      string        `gorm:"type:varchar(50);not null" json:"name"`
	OwnerID   uuid.UUID     `gorm:"type:uuid;not null;index" json:"owner_id"`
	Status    string        `gorm:"type:varchar(15);not null;default:'active'" json:"status"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
	Members   []TableMember `gorm:"foreignKey:TableID" json:"members,omitempty"`
}

type TableMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TableID  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_table_member_user" json:"table_id"`
	UserID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_table_member_user;index" json:"user_id"`
	Role     string    `gorm:"type:varchar(10);not null;default:'member'" json:"role"`
	Status   string    `gorm:"type:varchar(15);not null;default:'active'" json:"status"`
	JoinedAt time.Time `json:"joined_at"`
	User     User      `gorm:"foreignKey:UserID;references:UID" json:"user,omitempty"`
}

func (Table) TableName() string       { return "tables" }
func (TableMember) TableName() string { return "table_members" }
```

- [ ] **Step 4: Implement authorization**

Add to `fanda-server/internal/service/authz.go`:

```go
func CanAccessTable(ctx context.Context, uid uuid.UUID, tableID uuid.UUID) error {
	if tableID == uuid.Nil {
		return errors.New("餐桌不存在")
	}

	var count int64
	err := database.DB.WithContext(ctx).Model(&model.TableMember{}).
		Joins("JOIN tables ON tables.id = table_members.table_id").
		Where("table_members.table_id = ? AND table_members.user_id = ? AND table_members.status = 'active' AND tables.status = 'active'", tableID, uid).
		Count(&count).Error
	if err != nil {
		return err
	}
	if count == 0 {
		return errors.New("无权访问该餐桌")
	}
	return nil
}
```

Ensure imports include:

```go
import (
	"context"
	"errors"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)
```

- [ ] **Step 5: Run tests**

Run:

```bash
go test ./internal/service -run TestCanAccessTable -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fanda-server/internal/model/table.go fanda-server/internal/service/authz.go fanda-server/internal/service/authz_test.go
git commit -m "feat(server): add table authorization"
```

---

### Task 4: Add table service and API

**Files:**
- Create: `fanda-server/internal/service/table.go`
- Create: `fanda-server/internal/handler/table.go`
- Modify: `fanda-server/internal/router/router.go`
- Test: `fanda-server/internal/service/table_test.go`

- [ ] **Step 1: Add service tests**

Create `fanda-server/internal/service/table_test.go` with tests for default provisioning and listing:

```go
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

func setupTableTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Table{}, &model.TableMember{}))
	return db
}

func TestEnsurePersonalTableCreatesOneTable(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	uid := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)

	svc := NewTableService()
	table, err := svc.EnsurePersonalTable(context.Background(), uid)
	require.NoError(t, err)
	require.Equal(t, "personal", table.Type)
	require.Equal(t, "我的餐桌", table.Name)

	tableAgain, err := svc.EnsurePersonalTable(context.Background(), uid)
	require.NoError(t, err)
	require.Equal(t, table.ID, tableAgain.ID)
}

func TestListTablesReturnsUserTables(t *testing.T) {
	db := setupTableTestDB(t)
	database.DB = db
	uid := uuid.New()
	require.NoError(t, db.Create(&model.User{UID: uid, Nickname: "tester"}).Error)

	svc := NewTableService()
	_, err := svc.EnsurePersonalTable(context.Background(), uid)
	require.NoError(t, err)

	tables, err := svc.ListTables(context.Background(), uid)
	require.NoError(t, err)
	require.Len(t, tables, 1)
	require.Equal(t, "personal", tables[0].Type)
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
go test ./internal/service -run 'TestEnsurePersonalTable|TestListTables' -v
```

Expected: FAIL with `undefined: NewTableService`.

- [ ] **Step 3: Implement table service**

Create `fanda-server/internal/service/table.go`:

```go
package service

import (
	"context"
	"errors"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

type TableService struct{}

func NewTableService() *TableService {
	return &TableService{}
}

func (s *TableService) EnsurePersonalTable(ctx context.Context, uid uuid.UUID) (*model.Table, error) {
	var table model.Table
	err := database.DB.WithContext(ctx).
		Joins("JOIN table_members ON table_members.table_id = tables.id").
		Where("tables.type = ? AND tables.status = ? AND table_members.user_id = ? AND table_members.status = ?", "personal", "active", uid, "active").
		First(&table).Error
	if err == nil {
		return &table, nil
	}

	table = model.Table{
		ID:      uuid.New(),
		Type:    "personal",
		Name:    "我的餐桌",
		OwnerID: uid,
		Status:  "active",
	}
	member := model.TableMember{
		ID:      uuid.New(),
		TableID: table.ID,
		UserID:  uid,
		Role:    "owner",
		Status:  "active",
	}

	tx := database.DB.WithContext(ctx).Begin()
	if err := tx.Create(&table).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit().Error; err != nil {
		return nil, err
	}
	return &table, nil
}

func (s *TableService) ListTables(ctx context.Context, uid uuid.UUID) ([]model.Table, error) {
	if _, err := s.EnsurePersonalTable(ctx, uid); err != nil {
		return nil, err
	}

	var tables []model.Table
	err := database.DB.WithContext(ctx).
		Preload("Members", "status = ?", "active").
		Joins("JOIN table_members ON table_members.table_id = tables.id").
		Where("table_members.user_id = ? AND table_members.status = ? AND tables.status = ?", uid, "active", "active").
		Order("CASE tables.type WHEN 'personal' THEN 1 WHEN 'couple' THEN 2 ELSE 3 END, tables.created_at ASC").
		Find(&tables).Error
	return tables, err
}

func (s *TableService) RenameTable(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, name string) (*model.Table, error) {
	if name == "" {
		return nil, errors.New("餐桌名称不能为空")
	}
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}
	var table model.Table
	if err := database.DB.WithContext(ctx).First(&table, "id = ?", tableID).Error; err != nil {
		return nil, errors.New("餐桌不存在")
	}
	if table.OwnerID != uid {
		return nil, errors.New("只有餐桌创建者可以重命名")
	}
	if err := database.DB.WithContext(ctx).Model(&table).Update("name", name).Error; err != nil {
		return nil, err
	}
	table.Name = name
	return &table, nil
}
```

- [ ] **Step 4: Add handler and routes**

Create `fanda-server/internal/handler/table.go`:

```go
package handler

import (
	"net/http"

	"fanda-server/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type TableHandler struct {
	service *service.TableService
}

func NewTableHandler() *TableHandler {
	return &TableHandler{service: service.NewTableService()}
}

func (h *TableHandler) ListTables(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tables, err := h.service.ListTables(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"code": 500, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": tables})
}

func (h *TableHandler) RenameTable(c *gin.Context) {
	uid := c.MustGet("uid").(uuid.UUID)
	tableID, ok := parseUUIDParam(c, "id")
	if !ok {
		return
	}
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": "参数错误"})
		return
	}
	table, err := h.service.RenameTable(c.Request.Context(), uid, tableID, req.Name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"code": 400, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "ok", "data": table})
}
```

Modify `fanda-server/internal/router/router.go`:

```go
tableHandler := handler.NewTableHandler()
```

Add inside protected routes:

```go
tables := protected.Group("/tables")
{
	tables.GET("", tableHandler.ListTables)
	tables.PUT("/:id", tableHandler.RenameTable)
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
go test ./internal/service -run 'TestEnsurePersonalTable|TestListTables|TestCanAccessTable' -v
go test ./...
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add fanda-server/internal/service/table.go fanda-server/internal/handler/table.go fanda-server/internal/router/router.go fanda-server/internal/service/table_test.go
git commit -m "feat(server): add table API"
```

---

### Task 5: Migrate backend business APIs to table_id

**Files:**
- Modify: `fanda-server/internal/model/dish.go`
- Modify: `fanda-server/internal/model/order.go`
- Modify: `fanda-server/internal/model/feature.go`
- Modify: `fanda-server/internal/service/dish.go`
- Modify: `fanda-server/internal/service/order.go`
- Modify: `fanda-server/internal/service/calendar.go`
- Modify: `fanda-server/internal/service/feature.go`
- Modify: `fanda-server/internal/handler/dish.go`
- Modify: `fanda-server/internal/handler/order.go`
- Modify: `fanda-server/internal/handler/calendar.go`
- Modify: `fanda-server/internal/handler/feature.go`
- Test: `fanda-server/internal/service/order_test.go`

- [ ] **Step 1: Add order dual-write test**

Create `fanda-server/internal/service/order_test.go` with:

```go
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
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Table{}, &model.TableMember{}, &model.Dish{}, &model.Order{}, &model.OrderItem{}, &model.CalendarRecord{}, &model.OrderParticipant{}))
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
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
go test ./internal/service -run TestCreateOrderCreatesCalendarRecord -v
```

Expected: FAIL because `Dish.TableID`, `CreateOrderReq.TableID`, or `OrderParticipant` do not exist yet.

- [ ] **Step 3: Update models**

Change ownership models:

```go
type Dish struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OwnerID   uuid.UUID `gorm:"type:uuid;not null;index" json:"owner_id"`
	TableID   uuid.UUID `gorm:"type:uuid;not null;index" json:"table_id"`
	DishType  string    `gorm:"type:varchar(10);not null" json:"dish_type"`
	// keep existing fields unchanged after DishType
}
```

```go
type Order struct {
	ID               uuid.UUID          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatorID        uuid.UUID          `gorm:"type:uuid;not null;index" json:"creator_id"`
	TableID          uuid.UUID          `gorm:"type:uuid;not null;index" json:"table_id"`
	DineMode         string             `gorm:"type:varchar(10);not null" json:"dine_mode"`
	Status           string             `gorm:"type:varchar(15);not null;default:'pending'" json:"status"`
	TotalAmount      *float64           `gorm:"type:decimal(10,2)" json:"total_amount"`
	VoteDeadline     *time.Time         `json:"vote_deadline"`
	CalendarRecordID *uuid.UUID         `gorm:"type:uuid" json:"calendar_record_id"`
	CreatedAt        time.Time          `json:"created_at"`
	OrderItems       []OrderItem        `gorm:"foreignKey:OrderID" json:"order_items,omitempty"`
	Participants     []OrderParticipant `gorm:"foreignKey:OrderID" json:"participants,omitempty"`
}
```

Add:

```go
type OrderParticipant struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrderID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_order_participant_user" json:"order_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_order_participant_user" json:"user_id"`
	Status    string    `gorm:"type:varchar(15);not null;default:'invited'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (OrderParticipant) TableName() string { return "order_participants" }
```

Update `CalendarRecord`:

```go
TableID uuid.UUID `gorm:"type:uuid;not null;index:idx_calendar_table" json:"table_id"`
Status  string    `gorm:"type:varchar(15);not null;default:'confirmed'" json:"status"`
```

- [ ] **Step 4: Update order request and service**

Change `CreateOrderReq`:

```go
type CreateOrderReq struct {
	TableID        uuid.UUID      `json:"table_id" binding:"required"`
	DineMode       string         `json:"dine_mode" binding:"required,oneof=together solo"`
	ParticipantIDs []uuid.UUID    `json:"participant_ids"`
	Items          []OrderItemReq `json:"items" binding:"required,min=1"`
}
```

Use this status logic inside `CreateOrder`:

```go
if err := CanAccessTable(ctx, uid, req.TableID); err != nil {
	return nil, err
}

status := "confirmed"
recordStatus := "confirmed"
if req.DineMode == "together" && len(req.ParticipantIDs) > 0 {
	status = "pending"
	recordStatus = "pending"
}

order := model.Order{
	ID:        uuid.New(),
	CreatorID: uid,
	TableID:   req.TableID,
	DineMode:  req.DineMode,
	Status:    status,
}
```

Create `calendarRecord` in the same transaction:

```go
record := model.CalendarRecord{
	ID:         uuid.New(),
	UserID:     uid,
	TableID:    req.TableID,
	RecordDate: time.Now(),
	MealType:   "cook",
	MealPeriod: "",
	DishIDs:    dishIDs,
	Amount:     order.TotalAmount,
	Source:     "order",
	Status:     recordStatus,
}
```

Create participants only for together mode:

```go
for _, participantID := range req.ParticipantIDs {
	if participantID == uid {
		tx.Rollback()
		return nil, errors.New("不能邀请自己")
	}
	participant := model.OrderParticipant{
		ID:      uuid.New(),
		OrderID: order.ID,
		UserID:  participantID,
		Status:  "invited",
	}
	if err := tx.Create(&participant).Error; err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("添加参与人失败: %w", err)
	}
}
```

- [ ] **Step 5: Update handlers and related services**

For each request/query currently accepting `group_type` and `group_id`, accept `table_id` first:

```go
tableID, ok := parseUUIDQuery(c, "table_id")
if !ok {
	return
}
```

For JSON payloads, replace:

```go
GroupType string
GroupID uuid.UUID
```

with:

```go
TableID uuid.UUID
```

Each service must call `CanAccessTable(ctx, uid, tableID)`.

- [ ] **Step 6: Run backend tests**

Run:

```bash
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add fanda-server/internal/model fanda-server/internal/service fanda-server/internal/handler
git commit -m "feat(server): migrate business APIs to tables"
```

---

### Task 6: Update frontend types, API layer, and H5 mocks

**Files:**
- Modify: `fanda-app/src/types/index.ts`
- Modify: `fanda-app/src/services/api.ts`
- Test: `scripts/api-types.test.js`

- [ ] **Step 1: Add frontend table types**

In `fanda-app/src/types/index.ts`, add:

```ts
export type TableType = 'personal' | 'couple' | 'buddy'

export interface TableMember {
  id: string
  table_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  status: string
  joined_at: string
}

export interface Table {
  id: string
  type: TableType
  name: string
  owner_id: string
  status: string
  created_at: string
  updated_at: string
  members: TableMember[]
}

export interface OrderParticipant {
  id: string
  order_id: string
  user_id: string
  status: 'invited' | 'accepted' | 'rejected' | 'skipped'
  created_at: string
  updated_at: string
}
```

Change payloads:

```ts
export interface DishListParams {
  table_id: string
  dish_type?: string
  keyword?: string
  page: number
  page_size: number
}

export interface CreateOrderPayload {
  table_id: string
  dine_mode: 'solo' | 'together'
  participant_ids?: string[]
  order_items: OrderItemPayload[]
}
```

- [ ] **Step 2: Add table API**

In `fanda-app/src/services/api.ts`, add:

```ts
export const tableAPI = {
  list: () =>
    request<Table[]>({ url: '/tables', method: 'GET' }),

  rename: (id: string, name: string) =>
    request<Table>({ url: `/tables/${id}`, method: 'PUT', data: { name } }),
}
```

Import `Table` and `TableMember` from types.

- [ ] **Step 3: Update H5 mock**

Add:

```ts
const h5Tables: Table[] = [
  {
    id: 'h5-personal-table',
    type: 'personal',
    name: '我的餐桌',
    owner_id: 'h5-preview-user',
    status: 'active',
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
    members: [
      { id: 'h5-personal-member', table_id: 'h5-personal-table', user_id: 'h5-preview-user', role: 'owner', status: 'active', joined_at: '2026-08-10T09:00:00Z' },
    ],
  },
  {
    id: 'h5-buddy-table',
    type: 'buddy',
    name: '周末饭搭局',
    owner_id: 'h5-preview-user',
    status: 'active',
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
    members: [
      { id: 'h5-buddy-member-1', table_id: 'h5-buddy-table', user_id: 'h5-preview-user', role: 'owner', status: 'active', joined_at: '2026-08-10T09:00:00Z' },
      { id: 'h5-buddy-member-2', table_id: 'h5-buddy-table', user_id: 'h5-partner', role: 'member', status: 'active', joined_at: '2026-08-10T09:00:00Z' },
    ],
  },
]
```

Return table mocks:

```ts
if (url === '/tables') return ok(h5Tables) as ApiResponse<T>
```

Update `h5Dishes` to include `table_id` and remove UI reliance on `group_type/group_id`.

- [ ] **Step 4: Run type checks**

Run:

```bash
npm run test -- scripts/api-types.test.js
npx tsc --noEmit
```

Expected: PASS after all type updates in this task.

- [ ] **Step 5: Commit**

```bash
git add fanda-app/src/types/index.ts fanda-app/src/services/api.ts scripts/api-types.test.js
git commit -m "feat(app): add table API types"
```

---

### Task 7: Rebuild point ordering page and bottom navigation

**Files:**
- Modify: `fanda-app/src/app.config.ts`
- Modify: `fanda-app/src/pages/orders/create.config.ts`
- Modify: `fanda-app/src/pages/orders/create.tsx`
- Modify: `fanda-app/src/pages/orders/create.scss`
- Modify: `fanda-app/src/pages/index/index.tsx`
- Modify: `fanda-app/src/pages/index/index.scss`

- [ ] **Step 1: Update tab bar**

Change the second tab in `fanda-app/src/app.config.ts`:

```ts
{
  pagePath: 'pages/orders/create',
  text: '点单',
  iconPath: 'assets/tabbar/menu.png',
  selectedIconPath: 'assets/tabbar/menu-active.png'
}
```

Keep icon files for now to avoid asset churn. Replace later only if new `order-active.png` assets are provided.

- [ ] **Step 2: Update page title**

Change `fanda-app/src/pages/orders/create.config.ts`:

```ts
export default definePageConfig({
  navigationBarTitleText: '点单'
})
```

- [ ] **Step 3: Replace ordering page state model**

In `fanda-app/src/pages/orders/create.tsx`, use these state types:

```ts
interface SelectedDish {
  dish: Dish
  quantity: number
}

type CheckoutMode = 'solo' | 'together'

const LAST_ORDER_TABLE_KEY = 'last-order-table-id'
```

Core state:

```ts
const [tables, setTables] = useState<Table[]>([])
const [activeTableId, setActiveTableId] = useState('')
const [dishes, setDishes] = useState<Dish[]>([])
const [selectedDishes, setSelectedDishes] = useState<SelectedDish[]>([])
const [keyword, setKeyword] = useState('')
const [activeCategory, setActiveCategory] = useState('全部')
const [showTableSheet, setShowTableSheet] = useState(false)
const [showCheckoutSheet, setShowCheckoutSheet] = useState(false)
const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>('solo')
const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
```

- [ ] **Step 4: Implement table initialization**

Add:

```ts
const chooseInitialTable = (list: Table[]): string => {
  const lastTableId = Taro.getStorageSync(LAST_ORDER_TABLE_KEY)
  if (lastTableId && list.some(table => table.id === lastTableId)) {
    return lastTableId
  }
  const primary = list.find(table => table.type === 'personal' || table.type === 'couple')
  return primary?.id || list[0]?.id || ''
}

const loadTables = async () => {
  try {
    const res = await tableAPI.list()
    const list = res.data || []
    setTables(list)
    const nextTableId = chooseInitialTable(list)
    setActiveTableId(nextTableId)
    if (nextTableId) Taro.setStorageSync(LAST_ORDER_TABLE_KEY, nextTableId)
  } catch (err: unknown) {
    Taro.showToast({ title: getErrorMessage(err, '加载餐桌失败'), icon: 'none' })
  }
}
```

- [ ] **Step 5: Implement table switching**

Add:

```ts
const handleSwitchTable = (tableId: string) => {
  if (tableId === activeTableId) {
    setShowTableSheet(false)
    return
  }
  setActiveTableId(tableId)
  setSelectedDishes([])
  setShowTableSheet(false)
  Taro.setStorageSync(LAST_ORDER_TABLE_KEY, tableId)
  Taro.showToast({ title: '已切换餐桌，购物车已清空', icon: 'none' })
}
```

- [ ] **Step 6: Implement checkout behavior**

Add:

```ts
const getInvitableMembers = (): TableMember[] => {
  const table = tables.find(item => item.id === activeTableId)
  if (!table) return []
  const currentUid = Taro.getStorageSync('uid')
  return table.members.filter(member => member.user_id !== currentUid)
}

const handleCheckoutClick = () => {
  if (selectedDishes.length === 0) {
    Taro.showToast({ title: '请先选择菜品', icon: 'none' })
    return
  }
  const members = getInvitableMembers()
  if (members.length === 0) {
    submitOrder('solo', [])
    return
  }
  setCheckoutMode('solo')
  setSelectedParticipantIds(members.map(member => member.user_id))
  setShowCheckoutSheet(true)
}
```

Submit:

```ts
const submitOrder = async (mode: CheckoutMode, participantIds: string[]) => {
  if (!activeTableId) return
  if (mode === 'together' && participantIds.length === 0) {
    Taro.showToast({ title: '请选择一起吃的成员', icon: 'none' })
    return
  }
  try {
    await orderAPI.create({
      table_id: activeTableId,
      dine_mode: mode,
      participant_ids: mode === 'together' ? participantIds : [],
      order_items: selectedDishes.map(item => ({
        dish_id: item.dish.id,
        quantity: item.quantity,
        unit_price: item.dish.price,
      })),
    })
    setSelectedDishes([])
    setShowCheckoutSheet(false)
    Taro.showToast({ title: '下单成功', icon: 'success' })
  } catch (err: unknown) {
    Taro.showToast({ title: getErrorMessage(err, '下单失败'), icon: 'none' })
  }
}
```

- [ ] **Step 7: Render external food-delivery style layout**

The rendered structure must contain these class blocks:

```tsx
<View className='page-create-order'>
  <View className='order-header'>...</View>
  <View className='search-bar'>...</View>
  <View className='category-rail'>...</View>
  <ScrollView className='dish-scroll' scrollY>...</ScrollView>
  <View className='cart-bar'>...</View>
  {showTableSheet && <View className='sheet-mask'>...</View>}
  {showCheckoutSheet && <View className='sheet-mask'>...</View>}
</View>
```

Do not keep the old sections:

```text
群组类型
选择群组
就餐模式
选择菜品
```

- [ ] **Step 8: Update home menu management entry**

In `fanda-app/src/pages/index/index.tsx`, change the quick entry:

```tsx
<View className='quick-item' onClick={() => navigateTo('/pages/dishes/index')}>
  <Image className='sticker-icon' src={sticker('menu')} mode='aspectFit' />
  <Text className='quick-label'>菜单管理</Text>
</View>
```

Keep one `开始点单` or `点单` quick entry that navigates to `/pages/orders/create`.

- [ ] **Step 9: Run frontend checks**

Run:

```bash
npx tsc --noEmit
npm run build:h5
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add fanda-app/src/app.config.ts fanda-app/src/pages/orders/create.config.ts fanda-app/src/pages/orders/create.tsx fanda-app/src/pages/orders/create.scss fanda-app/src/pages/index/index.tsx fanda-app/src/pages/index/index.scss
git commit -m "feat(app): rebuild ordering tab"
```

---

### Task 8: Update menu, calendar, and secondary pages to table scope

**Files:**
- Modify: `fanda-app/src/pages/dishes/index.tsx`
- Modify: `fanda-app/src/pages/dishes/create.tsx`
- Modify: `fanda-app/src/pages/dishes/detail.tsx`
- Modify: `fanda-app/src/pages/calendar/index.tsx`
- Modify: `fanda-app/src/pages/basket/index.tsx`
- Modify: `fanda-app/src/pages/wishes/index.tsx`
- Modify: `fanda-app/src/pages/budget/index.tsx`
- Modify: `fanda-app/src/pages/couple/index.tsx`
- Modify: `fanda-app/src/pages/buddy/index.tsx`

- [ ] **Step 1: Add shared table context helper**

Create `fanda-app/src/utils/table.ts`:

```ts
import type { Table } from '@/types'

export const LAST_ORDER_TABLE_KEY = 'last-order-table-id'

export const getPrimaryTable = (tables: Table[]): Table | null => {
  return tables.find(table => table.type === 'personal' || table.type === 'couple') || tables[0] || null
}

export const getTableDisplayName = (table: Table | null): string => {
  if (!table) return '我的餐桌'
  return table.name || (table.type === 'couple' ? '情侣餐桌' : table.type === 'personal' ? '我的餐桌' : '饭搭餐桌')
}
```

- [ ] **Step 2: Replace group selectors with table selectors**

In each page, remove user-facing selectors that say:

```text
情侣
饭搭子
群组类型
```

Use:

```text
餐桌
切换餐桌
我的餐桌
情侣餐桌
饭搭餐桌
```

API params must use:

```ts
{ table_id: activeTableId }
```

- [ ] **Step 3: Run frontend checks**

Run:

```bash
npx tsc --noEmit
npm run build:h5
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add fanda-app/src/pages fanda-app/src/utils/table.ts
git commit -m "feat(app): migrate secondary pages to tables"
```

---

### Task 9: Update validation scripts and run full verification

**Files:**
- Modify: `scripts/api-types.test.js`
- Modify: `scripts/page-types.test.js`
- Modify: `scripts/server-service-types.test.js`
- Modify: `scripts/h5-preview.test.js`

- [ ] **Step 1: Update static type guard scripts**

Replace checks that require `group_type/group_id` in frontend request payloads with `table_id`.

Add a negative assertion to `scripts/api-types.test.js`:

```js
assert(!apiContent.includes('request<any>'), 'api.ts must not use request<any>')
assert(!apiContent.includes('Record<string, any>'), 'api.ts must not use Record<string, any>')
assert(apiContent.includes('tableAPI'), 'api.ts must export tableAPI')
```

Add page check:

```js
assert(!ordersCreateContent.includes('群组类型'), 'orders/create must not show group type step')
assert(ordersCreateContent.includes('last-order-table-id'), 'orders/create must remember last table')
```

- [ ] **Step 2: Run all verification**

Run:

```bash
npm test
go test ./...
npx tsc --noEmit
npm run build:h5
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add scripts
git commit -m "test: update table refactor guards"
```

---

### Task 10: Final product review and cleanup

**Files:**
- Review all modified files.

- [ ] **Step 1: Search old public language**

Run:

```bash
grep -R "群组类型\\|选择群组\\|情侣关系\\|新建点单" fanda-app/src README.md couple-menu-prd tech-plan fanda-hi-fi-ui-design
```

Expected: no user-facing matches. Code comments about historical migration may remain only in backend migration or design docs.

- [ ] **Step 2: Search broad types**

Run:

```bash
grep -R "any\\|interface{}\\|map\\[string\\]interface{}" fanda-app/src fanda-server/internal/service
```

Expected: no new broad types. Existing JWT `Keyfunc` exception in auth remains allowed.

- [ ] **Step 3: Final status**

Run:

```bash
git status --short
```

Expected: clean working tree.

- [ ] **Step 4: Final commit if needed**

If cleanup changed files:

```bash
git add .
git commit -m "chore: finish table refactor cleanup"
```

---

## Self-review

Spec coverage:

- `tables` model: covered in Tasks 2, 3, 4, 5, 6, 8.
- Bottom nav `首页 / 点单 / 日历 / 我的`: covered in Task 7.
- External food-delivery ordering page: covered in Task 7.
- Last-used table fallback: covered in Task 7 and shared helper in Task 8.
- Clear cart on table switch: covered in Task 7.
- Single table direct order success: covered in Task 7 and Task 5.
- Multi-member invitation: covered in Task 5 and Task 7.
- `order` and `calendar_record` dual creation: covered in Task 5.
- Product docs, tech docs, UI artifacts: covered in Task 1.
- Validation and type-safety constraints: covered in Tasks 6, 9, and 10.

Placeholder scan:

- No placeholder markers or deferred implementation instructions are included.
- Each task includes exact file paths, commands, expected outcomes, and concrete code or copy where the task changes code.

Type consistency:

- Backend uses `TableID`, `table_id`, `Table`, `TableMember`, and `OrderParticipant`.
- Frontend uses `Table`, `TableMember`, `OrderParticipant`, and `last-order-table-id`.
- User-facing copy uses `餐桌` terminology; `couple / buddy` remains only as internal table type values.
