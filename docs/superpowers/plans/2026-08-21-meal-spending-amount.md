# 用餐金额确认与同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现菜品参考金额、订单项确认金额和日历实际花费的分层管理，并修复饭搭成员权限残留和订单列表非法餐桌 ID。

**Architecture:** 保留现有 `dishes.price` 和 `order_items.unit_price`，新增 `order_items.confirmed_amount` 表示订单项本次合计金额。服务端统一校验金额并在事务中汇总 `orders.total_amount` 与 `calendar_records.amount`；订单来源日历只能逐项修改，手工记录继续直接编辑本餐金额。

**Tech Stack:** Go 1.25、Gin、GORM、PostgreSQL、SQLite 测试、Taro 4、React 18、TypeScript、SCSS、Node Test Runner、OpenAPI 3。

---

## 文件结构

### 新增文件

- `fanda-server/migrations/006_order_item_confirmed_amount.sql`：新增确认金额并迁移历史数据。
- `fanda-server/internal/service/amount.go`：金额校验、归一化和 nullable 汇总。
- `fanda-server/internal/service/amount_test.go`：金额工具单元测试。
- `fanda-server/internal/service/calendar_test.go`：日历金额同步服务测试。
- `fanda-app/src/utils/amount.ts`：前端金额输入、默认值和汇总纯函数。
- `docs/superpowers/plans/2026-08-21-meal-spending-amount.md`：本实施计划。

### 修改文件

- `fanda-server/migrations/migrations_test.go`
- `fanda-server/internal/model/order.go`
- `fanda-server/internal/service/order.go`
- `fanda-server/internal/service/order_test.go`
- `fanda-server/internal/service/calendar.go`
- `fanda-server/internal/service/auth.go`
- `fanda-server/internal/service/authz_test.go`
- `fanda-server/internal/handler/order.go`
- `fanda-server/internal/handler/calendar.go`
- `scripts/generate-openapi.js`
- `scripts/openapi-generation.test.js`
- `scripts/api-types.test.js`
- `scripts/page-types.test.js`
- `docs/openapi.json`，由生成器生成
- `fanda-app/src/types/generated-api.ts`，由生成器生成
- `fanda-app/src/types/index.ts`
- `fanda-app/src/services/api.ts`
- `fanda-app/src/services/h5-preview.ts`
- `fanda-app/src/pages/orders/create.tsx`
- `fanda-app/src/pages/orders/create.scss`
- `fanda-app/src/pages/orders/index.tsx`
- `fanda-app/src/pages/orders/index.scss`
- `fanda-app/src/pages/calendar/record.tsx`
- `fanda-app/src/pages/calendar/record.scss`
- `fanda-app/src/__tests__/page-data-flow.test.cjs`
- `README.md`
- `docs/architecture.md`
- `docs/superpowers/specs/2026-08-11-table-order-refactor-design.md`

### Git 约束

本计划不执行 `git commit` 或 `git push`。每个任务完成后仅检查 `git diff` 和测试结果，由用户决定何时提交。

---

### Task 1：数据库迁移

**Files:**
- Create: `fanda-server/migrations/006_order_item_confirmed_amount.sql`
- Modify: `fanda-server/migrations/migrations_test.go`

- [ ] **Step 1：先写迁移静态测试**

在 `migrations_test.go` 增加测试，读取 `006_order_item_confirmed_amount.sql` 并断言：

```go
func TestConfirmedAmountMigration(t *testing.T) {
    sql := readMigration(t, "006_order_item_confirmed_amount.sql")
    require.Contains(t, sql, "ADD COLUMN confirmed_amount DECIMAL(10,2)")
    require.Contains(t, sql, "ROUND(unit_price * quantity, 2)")
    require.Contains(t, sql, "SUM(confirmed_amount)")
    require.Contains(t, sql, "orders.calendar_record_id = calendar_records.id")
}
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
go -C fanda-server test ./migrations -run ConfirmedAmount -v
```

Expected: FAIL，原因是迁移文件不存在。

- [ ] **Step 3：新增迁移**

迁移必须包含：

```sql
ALTER TABLE order_items
ADD COLUMN confirmed_amount DECIMAL(10,2);

UPDATE order_items
SET confirmed_amount = CASE
    WHEN unit_price IS NULL THEN NULL
    ELSE ROUND(unit_price * quantity, 2)
END;

UPDATE orders
SET total_amount = totals.total_amount
FROM (
    SELECT order_id, SUM(confirmed_amount) AS total_amount
    FROM order_items
    GROUP BY order_id
) AS totals
WHERE totals.order_id = orders.id;

UPDATE calendar_records
SET amount = orders.total_amount
FROM orders
WHERE orders.calendar_record_id = calendar_records.id;
```

- [ ] **Step 4：验证迁移测试**

Run:

```bash
go -C fanda-server test ./migrations -v
```

Expected: PASS。

---

### Task 2：金额领域工具和模型

**Files:**
- Create: `fanda-server/internal/service/amount.go`
- Create: `fanda-server/internal/service/amount_test.go`
- Modify: `fanda-server/internal/model/order.go`

- [ ] **Step 1：编写金额工具失败测试**

表驱动覆盖：

```go
func TestNormalizeAmount(t *testing.T) {
    tests := []struct {
        name    string
        input   *float64
        want    *float64
        wantErr string
    }{
        {name: "nil", input: nil, want: nil},
        {name: "zero", input: floatPtr(0), want: floatPtr(0)},
        {name: "two decimals", input: floatPtr(12.34), want: floatPtr(12.34)},
        {name: "negative", input: floatPtr(-0.01), wantErr: "金额不能小于 0"},
        {name: "three decimals", input: floatPtr(12.345), wantErr: "金额最多保留两位小数"},
        {name: "nan", input: floatPtr(math.NaN()), wantErr: "金额必须是有效数字"},
        {name: "infinity", input: floatPtr(math.Inf(1)), wantErr: "金额必须是有效数字"},
    }
}
```

汇总测试必须证明：

```text
[nil, nil] -> nil
[0, nil] -> 0
[10.10, nil, 2.20] -> 12.30
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
go -C fanda-server test ./internal/service -run 'Amount|Confirmed' -v
```

Expected: FAIL，金额工具尚不存在。

- [ ] **Step 3：实现共享金额工具**

`amount.go` 提供：

```go
func normalizeAmount(value *float64) (*float64, error)
func sumAmounts(values []*float64) *float64
func roundAmount(value float64) float64
```

实现规则：

```go
if math.IsNaN(*value) || math.IsInf(*value, 0) {
    return nil, errors.New("金额必须是有效数字")
}
if *value < 0 {
    return nil, errors.New("金额不能小于 0")
}
rounded := math.Round(*value*100) / 100
if math.Abs(*value-rounded) > 1e-9 {
    return nil, errors.New("金额最多保留两位小数")
}
```

`sumAmounts` 使用 `hasAmount bool` 区分全空与合法的全零。

- [ ] **Step 4：扩展订单项模型**

在 `OrderItem` 增加：

```go
ConfirmedAmount *float64 `gorm:"type:decimal(10,2)" json:"confirmed_amount"`
```

更新注释：

```go
// UnitPrice 保存下单时参考单价快照；ConfirmedAmount 保存该订单项本次合计实际金额。
```

- [ ] **Step 5：运行金额测试**

Run:

```bash
go -C fanda-server test ./internal/service -run 'Amount|Confirmed' -v
```

Expected: PASS。

---

### Task 3：订单创建金额语义

**Files:**
- Modify: `fanda-server/internal/service/order.go`
- Modify: `fanda-server/internal/service/order_test.go`
- Modify: `fanda-server/internal/handler/order.go`

- [ ] **Step 1：扩展订单测试数据库**

在测试 schema 的 `order_items` 增加：

```sql
confirmed_amount REAL
```

- [ ] **Step 2：编写订单创建失败测试**

新增用例：

```text
TestCreateOrderUsesDishPriceAsReferenceSnapshot
TestCreateOrderPersistsConfirmedAmountWithoutMultiplyingQuantity
TestCreateOrderAggregatesConfirmedAmounts
TestCreateOrderKeepsAllNullAmountsNull
TestCreateOrderKeepsZeroAmountNonNull
TestCreateOrderRejectsInvalidConfirmedAmount
```

核心断言：

```go
require.Equal(t, 20.0, *item.UnitPrice)
require.Equal(t, 55.0, *item.ConfirmedAmount)
require.Equal(t, 55.0, *order.TotalAmount)
require.Equal(t, 55.0, *record.Amount)
```

其中数量设为 `3`，确认金额设为 `55`，确保结果不是 `165`。

- [ ] **Step 3：运行订单测试并确认失败**

Run:

```bash
go -C fanda-server test ./internal/service -run CreateOrder -v
```

Expected: FAIL，当前请求没有 `confirmed_amount`，且仍信任 `unit_price`。

- [ ] **Step 4：调整请求结构**

将 `OrderItemReq` 改为：

```go
type OrderItemReq struct {
    DishID          uuid.UUID `json:"dish_id" binding:"required"`
    Quantity        int       `json:"quantity" binding:"required,min=1"`
    ConfirmedAmount *float64  `json:"confirmed_amount"`
}
```

- [ ] **Step 5：事务内加载菜品**

新增返回菜品映射的辅助函数：

```go
func loadOrderDishes(
    ctx context.Context,
    tx *gorm.DB,
    tableID uuid.UUID,
    items []OrderItemReq,
) (map[uuid.UUID]model.Dish, error)
```

必须同时校验：

```text
id 在请求集合中
table_id 等于目标餐桌
is_deleted = false
返回数量等于去重后的请求菜品数量
```

- [ ] **Step 6：按确认金额创建订单项**

每项处理：

```go
confirmedAmount, err := normalizeAmount(item.ConfirmedAmount)
if err != nil {
    return fmt.Errorf("确认金额无效: %w", err)
}
orderItem := model.OrderItem{
    ID:              uuid.New(),
    OrderID:         order.ID,
    DishID:          item.DishID,
    Quantity:        item.Quantity,
    UnitPrice:       dish.Price,
    ConfirmedAmount: confirmedAmount,
}
```

总金额使用 `sumAmounts` 汇总 `ConfirmedAmount`，不得乘 `Quantity`。

- [ ] **Step 7：调整 handler 错误映射**

请求金额、菜品归属和业务校验错误返回 `400`；数据库创建失败保留 `500`。不改变鉴权中间件行为。

- [ ] **Step 8：验证订单测试**

Run:

```bash
go -C fanda-server test ./internal/service -run CreateOrder -v
go -C fanda-server test ./internal/handler -v
```

Expected: PASS。

---

### Task 4：日历详情与金额同步

**Files:**
- Create: `fanda-server/internal/service/calendar_test.go`
- Modify: `fanda-server/internal/service/calendar.go`
- Modify: `fanda-server/internal/handler/calendar.go`

- [ ] **Step 1：编写日历服务失败测试**

建立最小 SQLite schema 并新增：

```text
TestUpdateManualRecordAllowsAmount
TestUpdateManualRecordRejectsOrderItems
TestUpdateOrderRecordRejectsDirectAmount
TestUpdateOrderRecordRecalculatesAllItems
TestUpdateOrderRecordRejectsForeignItem
TestUpdateOrderRecordRollsBackAllAmounts
TestGetRecordIncludesOrderItems
```

局部更新测试需要准备两个订单项：

```text
item A: 10.00 -> 更新为 15.00
item B: 20.00 -> 不提交，保持 20.00
订单和日历新总额：35.00
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
go -C fanda-server test ./internal/service -run 'Record|Calendar' -v
```

Expected: FAIL，当前日历服务不支持订单项金额。

- [ ] **Step 3：实现 presence-aware 金额输入**

新增：

```go
type OptionalAmount struct {
    Set   bool
    Value *float64
}

func (a *OptionalAmount) UnmarshalJSON(data []byte) error
```

语义：

```text
字段缺省 -> Set=false
字段为 null -> Set=true, Value=nil
字段为数字 -> Set=true, Value=&number
```

`UpdateRecordReq.Amount` 和 `UpdateOrderItemAmountReq.ConfirmedAmount` 使用该类型，确保能够显式清空金额。

- [ ] **Step 4：定义日历详情 DTO**

在 service 或 handler 中定义具体类型：

```go
type CalendarOrderItemDetail struct {
    ID              uuid.UUID `json:"id"`
    DishID          uuid.UUID `json:"dish_id"`
    DishName        string    `json:"dish_name"`
    Quantity        int       `json:"quantity"`
    UnitPrice       *float64  `json:"unit_price"`
    ConfirmedAmount *float64  `json:"confirmed_amount"`
}

type CalendarOrderDetail struct {
    ID    uuid.UUID                 `json:"id"`
    Items []CalendarOrderItemDetail `json:"items"`
}

type CalendarRecordDetail struct {
    model.CalendarRecord
    Order *CalendarOrderDetail `json:"order,omitempty"`
}
```

若嵌入模型导致 JSON 字段不稳定，则显式列出当前日历详情全部字段，不使用 `map[string]any`。

- [ ] **Step 5：实现来源分流**

`UpdateRecord` 在事务中执行：

```go
switch record.Source {
case "manual":
    if len(req.OrderItems) > 0 {
        return errors.New("手工记录不能提交订单项金额")
    }
    // Amount.Set 时校验并更新，可写入 NULL。
case "order":
    if req.Amount.Set {
        return errors.New("订单来源记录不能直接修改本餐总金额")
    }
    // 更新关联订单项后重新查询全部订单项并汇总。
default:
    return errors.New("记录来源无效")
}
```

- [ ] **Step 6：实现事务回滚**

订单项更新、订单总额更新、日历总额更新必须使用同一个 `tx`。测试通过 SQLite trigger 强制最后一步失败，并断言前三处数据都保持原值。

- [ ] **Step 7：验证日历测试**

Run:

```bash
go -C fanda-server test ./internal/service -run 'Record|Calendar' -v
go -C fanda-server test ./internal/handler -v
```

Expected: PASS。

---

### Task 5：饭搭成员权限一致性

**Files:**
- Modify: `fanda-server/internal/service/auth.go`
- Modify: `fanda-server/internal/service/authz_test.go`

- [ ] **Step 1：编写权限失败测试**

新增：

```text
TestRemoveBuddyMemberRevokesTableAccess
TestRemoveBuddyMemberRejectsSelfRemoval
TestRemoveBuddyMemberRejectsNonAdmin
TestRemoveBuddyMemberRollsBackWhenTableMemberDeleteFails
```

第一个测试在移除前后分别调用：

```go
require.NoError(t, CanAccessTable(ctx, targetUID, groupID))
require.NoError(t, service.RemoveBuddyMember(ctx, ownerUID, groupID.String(), targetUID.String()))
require.Error(t, CanAccessTable(ctx, targetUID, groupID))
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
go -C fanda-server test ./internal/service -run RemoveBuddyMember -v
```

Expected: FAIL，目标成员仍存在于 `table_members`。

- [ ] **Step 3：事务化移除**

在同一 `Transaction` 内：

```go
result := tx.Where(
    "table_id = ? AND user_id = ?",
    gID,
    tID,
).Delete(&model.TableMember{})
```

确认餐桌成员存在并删除成功后，再删除：

```go
tx.Where(
    "group_id = ? AND user_id = ?",
    gID,
    tID,
).Delete(&model.BuddyMember{})
```

权限校验、目标存在校验和两次删除都使用 `tx.WithContext(ctx)`。

- [ ] **Step 4：验证权限测试**

Run:

```bash
go -C fanda-server test ./internal/service -run 'RemoveBuddyMember|CanAccessTable' -v
```

Expected: PASS。

---

### Task 6：OpenAPI 与生成类型

**Files:**
- Modify: `scripts/generate-openapi.js`
- Modify: `scripts/openapi-generation.test.js`
- Modify: `scripts/api-types.test.js`
- Generate: `docs/openapi.json`
- Generate: `fanda-app/src/types/generated-api.ts`
- Modify: `fanda-app/src/types/index.ts`
- Modify: `fanda-app/src/services/api.ts`

- [ ] **Step 1：编写契约失败测试**

断言 OpenAPI 和生成 TS 包含：

```text
OrderItem.confirmed_amount
OrderItemPayload.confirmed_amount
CalendarOrderItem
CalendarOrder
CalendarRecord.order
CalendarRecordUpdateOrderItem
CalendarRecordUpdatePayload.order_items
```

同时断言 `OrderItemPayload` 不再包含 `unit_price`。

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
npm test -- --test-name-pattern="openapi|API types"
```

Expected: FAIL，契约尚未更新。

- [ ] **Step 3：更新契约源**

在 `generate-openapi.js` 的 schema 和 `generatedApiSource` 同步定义：

```ts
export interface OrderItemPayload {
  dish_id: string
  quantity: number
  confirmed_amount: number | null
}

export interface CalendarRecordUpdateOrderItem {
  id: string
  confirmed_amount: number | null
}
```

为日历详情增加明确的 `CalendarOrder` 和 `CalendarOrderItem`，不得使用索引签名或 `any`。

- [ ] **Step 4：生成产物**

Run:

```bash
npm run generate:api
```

Expected: `docs/openapi.json` 与 `generated-api.ts` 更新。

- [ ] **Step 5：调整类型导出和 API 泛型**

`src/types/index.ts` 从生成类型导出新增类型；`calendarAPI.get/update` 使用具体详情和更新请求类型。

- [ ] **Step 6：验证契约**

Run:

```bash
npm test
npm --prefix fanda-app run typecheck
```

Expected: 契约测试通过；前端页面可能因旧字段产生类型错误，记录这些错误供后续任务修复。

---

### Task 7：前端金额纯函数与 H5 Mock

**Files:**
- Create: `fanda-app/src/utils/amount.ts`
- Modify: `fanda-app/src/__tests__/page-data-flow.test.cjs`
- Modify: `fanda-app/src/services/h5-preview.ts`

- [ ] **Step 1：编写前端金额失败测试**

复用现有 TypeScript 转译测试方式，覆盖：

```text
参考价 20 × 数量 3 -> 默认输入 "60.00"
空参考价 -> ""
输入 "0" -> 0
输入 "12.34" -> 12.34
输入 "-1"、"1.234"、"abc" -> 校验错误
[10.10, null, 2.20] -> 12.30
[null, null] -> null
[0, null] -> 0
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
npm --prefix fanda-app test
```

Expected: FAIL，金额工具不存在。

- [ ] **Step 3：实现纯函数**

导出：

```ts
export function getDefaultConfirmedAmount(
  price: number | null,
  quantity: number,
): string

export function parseAmountInput(value: string): number | null

export function validateAmountInput(value: string): string | null

export function sumNullableAmounts(
  values: Array<number | null>,
): number | null
```

函数不得依赖 Taro 或 React。

- [ ] **Step 4：更新 H5 Mock**

Mock 创建订单：

- `unit_price` 从 Mock 菜品读取；
- `confirmed_amount` 使用 payload；
- `total_amount` 汇总非空确认金额；
- `0` 保持为非空；
- 日历详情返回关联订单项；
- 日历 PUT 按来源更新并同步总金额。

- [ ] **Step 5：验证前端纯函数**

Run:

```bash
npm --prefix fanda-app test
npm --prefix fanda-app run typecheck
```

Expected: PASS 或只剩页面旧字段错误。

---

### Task 8：点单确认页

**Files:**
- Modify: `fanda-app/src/pages/orders/create.tsx`
- Modify: `fanda-app/src/pages/orders/create.scss`
- Modify: `scripts/page-types.test.js`

- [ ] **Step 1：编写页面契约失败测试**

静态断言：

```js
assert.match(source, /本次确认金额/)
assert.match(source, /本餐总金额/)
assert.match(source, /confirmed_amount\s*:/)
assert.doesNotMatch(source, /unit_price\s*:/)
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
npm test -- --test-name-pattern="ordering|金额"
```

Expected: FAIL。

- [ ] **Step 3：扩展选中菜品状态**

每项增加：

```ts
confirmedAmount: string
amountTouched: boolean
```

规则：

- 首次选择时按参考价乘数量初始化；
- 未手动修改时，数量变化同步刷新默认值；
- 手动修改后，数量变化不覆盖用户输入；
- 删除后重新选择视为新订单项，恢复默认值。

- [ ] **Step 4：实现确认面板**

每项展示参考单价和确认金额输入框。总金额使用 `sumNullableAmounts`，只读显示：

```tsx
<Text className='confirm-total-label'>本餐总金额</Text>
<Text className='confirm-total-value'>
  {confirmedTotal == null ? '待填写' : `¥${confirmedTotal.toFixed(2)}`}
</Text>
```

- [ ] **Step 5：提交确认金额**

请求项：

```ts
{
  dish_id: item.dish.id,
  quantity: item.quantity,
  confirmed_amount: parseAmountInput(item.confirmedAmount),
}
```

提交前逐项调用 `validateAmountInput`。失败时保留面板和已填写内容。

- [ ] **Step 6：调整样式**

沿用现有确认 sheet 的连续列表，不新增厚重卡片。输入行必须设置：

```scss
min-width: 0;
box-sizing: border-box;
```

所有 fixed 容器保持 `max-width: 430px`、水平居中和 `bottom: 50px`。

- [ ] **Step 7：验证点单页**

Run:

```bash
npm test -- --test-name-pattern="ordering|金额"
npm --prefix fanda-app run typecheck
npm --prefix fanda-app run lint -- --no-cache
```

Expected: PASS。

---

### Task 9：订单列表真实餐桌和金额显示

**Files:**
- Modify: `fanda-app/src/pages/orders/index.tsx`
- Modify: `fanda-app/src/pages/orders/index.scss`
- Modify: `scripts/page-types.test.js`

- [ ] **Step 1：编写失败测试**

断言：

```js
assert.doesNotMatch(source, /DEFAULT_TABLE_ID/)
assert.doesNotMatch(source, /\/\s*100/)
assert.match(source, /tableAPI\.list/)
assert.match(source, /getStoredTableId/)
assert.match(source, /confirmed_amount/)
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
npm test -- --test-name-pattern="订单列表|金额"
```

Expected: FAIL。

- [ ] **Step 3：加载真实餐桌**

页面进入时先调用 `tableAPI.list()`，用 `getStoredTableId` 选择有效餐桌。无餐桌时：

```ts
setActiveTableId('')
setOrders([])
setTotal(0)
return
```

禁止请求 `orderAPI.list`。

- [ ] **Step 4：修复金额展示**

订单项显示：

```tsx
{item.confirmed_amount != null && (
  <Text>实际 ¥{item.confirmed_amount.toFixed(2)}</Text>
)}
```

参考单价可作为弱化信息显示。订单总额直接：

```tsx
¥{order.total_amount.toFixed(2)}
```

不做 `/ 100`。

- [ ] **Step 5：验证订单列表**

Run:

```bash
npm test -- --test-name-pattern="订单列表|金额"
npm --prefix fanda-app run typecheck
```

Expected: PASS。

---

### Task 10：日历详情编辑

**Files:**
- Modify: `fanda-app/src/pages/calendar/record.tsx`
- Modify: `fanda-app/src/pages/calendar/record.scss`
- Modify: `fanda-app/src/__tests__/page-data-flow.test.cjs`
- Modify: `scripts/page-types.test.js`

- [ ] **Step 1：编写失败测试**

断言并执行：

```text
读取 router.params.edit
订单记录提交 order_items
订单记录不提交 amount
手工记录提交 amount
订单项变化后汇总全部项
```

- [ ] **Step 2：运行测试并确认失败**

Run:

```bash
npm test -- --test-name-pattern="calendar|日历|金额"
npm --prefix fanda-app test
```

Expected: FAIL。

- [ ] **Step 3：实现编辑模式**

新增：

```ts
const isEditMode = router.params?.edit === '1'
```

加载记录后初始化：

```ts
mealType
mealPeriod
restaurant
manual amount
editable order items
```

- [ ] **Step 4：实现来源分流 UI**

订单来源：

- 逐项确认金额输入；
- 本餐总金额只读；
- 不渲染可编辑总金额。

手工来源：

- 保留本餐金额输入；
- 不渲染订单项金额。

- [ ] **Step 5：实现保存**

订单来源提交：

```ts
{
  meal_type: editMealType,
  meal_period: editMealPeriod,
  restaurant: editRestaurant,
  order_items: editableItems.map(item => ({
    id: item.id,
    confirmed_amount: parseAmountInput(item.confirmedAmount),
  })),
}
```

手工来源提交：

```ts
{
  meal_type: editMealType,
  meal_period: editMealPeriod,
  restaurant: editRestaurant,
  amount: parseAmountInput(editAmount),
}
```

失败时保留输入和编辑态；成功后返回详情态并重新加载记录。

- [ ] **Step 6：实现紧凑样式**

订单项采用连续列表，每项最多两行；输入框不导致横向溢出。固定操作区遵守 430px H5 容器和 Tabbar 避让规范。

- [ ] **Step 7：验证日历页面**

Run:

```bash
npm test -- --test-name-pattern="calendar|日历|金额"
npm --prefix fanda-app test
npm --prefix fanda-app run typecheck
```

Expected: PASS。

---

### Task 11：文档与全量验证

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/specs/2026-08-11-table-order-refactor-design.md`
- Modify: `scripts/docs-consistency.test.js`

- [ ] **Step 1：更新文档一致性测试**

要求 README 和架构文档包含：

```text
参考金额
本次确认金额
订单项确认金额汇总
订单来源日历不能直接修改总金额
006_order_item_confirmed_amount.sql
```

- [ ] **Step 2：更新文档**

明确：

```text
dishes.price
  -> order_items.unit_price 参考快照
  -> order_items.confirmed_amount 用户确认
  -> orders.total_amount 自动汇总
  -> calendar_records.amount 同步
```

历史设计文档的 `order_items` 增加 `confirmed_amount`，并注明后续设计覆盖旧的价格语义。

- [ ] **Step 3：运行格式和差异检查**

Run:

```bash
gofmt -w fanda-server/internal/model/order.go \
  fanda-server/internal/service/amount.go \
  fanda-server/internal/service/amount_test.go \
  fanda-server/internal/service/order.go \
  fanda-server/internal/service/order_test.go \
  fanda-server/internal/service/calendar.go \
  fanda-server/internal/service/calendar_test.go \
  fanda-server/internal/service/auth.go \
  fanda-server/internal/service/authz_test.go \
  fanda-server/internal/handler/order.go \
  fanda-server/internal/handler/calendar.go
git diff --check
```

Expected: 无格式和空白错误。

- [ ] **Step 4：运行全量验证**

Run:

```bash
npm test
go -C fanda-server test ./...
go -C fanda-server vet ./...
npm --prefix fanda-app run check
npm run build:h5
```

Expected: 全部通过。

- [ ] **Step 5：检查范围**

Run:

```bash
git status --short
git diff --stat
```

确认：

- 没有无关文件；
- 没有调试 `console.log`；
- 没有 `any`；
- 没有修改已发布迁移；
- 没有 Git commit 或 push。

---

## 完成定义

- [ ] 数据库 006 迁移可被现有迁移运行器发现。
- [ ] 菜品参考金额不影响历史订单。
- [ ] 点单确认金额按订单项合计保存，不重复乘数量。
- [ ] 订单和订单来源日历总额只由订单项汇总。
- [ ] 日历可逐项修改历史确认金额。
- [ ] 手工日历记录仍可直接修改本餐金额。
- [ ] 全部页面金额单位为元。
- [ ] 订单列表不再请求伪餐桌 ID。
- [ ] 饭搭成员移除后失去餐桌访问权限。
- [ ] OpenAPI、生成类型、Mock 和真实服务行为一致。
- [ ] 所有测试、类型检查、Lint、Vet 和 H5 构建通过。
- [ ] 未自动提交或推送 Git。
