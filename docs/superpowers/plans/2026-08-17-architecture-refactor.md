# 饭搭全项目架构重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目从 demo 优化后的“可演示状态”升级为可持续迭代的架构：统一餐桌领域模型、可靠迁移、稳定 API 契约、前端数据流清晰、工程护栏可自动防回归。

**Architecture:** 以 `tables/table_members` 作为唯一权限边界，后端按领域服务拆分职责，订单、日历、预算、菜篮子、心愿都通过 `table_id` 关联。前端把 request、鉴权、H5 mock、业务 API、餐桌选择状态拆开，避免页面直接依赖隐式状态和生产可见 mock。

**Tech Stack:** Go + Gin + GORM + PostgreSQL + Redis；Taro + React + TypeScript + SCSS；Node.js 脚本测试；PostgreSQL SQL migrations。

**重要约束:** 本计划禁止自动 `git commit` / `git push`。每个任务完成后只做检查点汇报，由用户决定是否提交。

---

## 文件结构规划

### 后端

- Modify: `fanda-server/internal/service/auth.go`
  - 保留登录、手机号绑定、账号合并。
  - 移出情侣/饭搭关系创建和加入的核心餐桌逻辑。
- Modify: `fanda-server/internal/service/table.go`
  - 成为餐桌生命周期主入口。
  - 增加创建情侣餐桌、创建饭搭餐桌、加入饭搭餐桌、成员同步、个人餐桌幂等创建。
- Modify: `fanda-server/internal/service/authz.go`
  - 明确 `CanAccessTable`、`CanManageTable`、`CanAccessOrder` 边界。
- Modify: `fanda-server/internal/service/order.go`
  - 增加订单状态机、菜品归属校验、日历和参与人同步。
- Modify: `fanda-server/internal/service/feature.go`
  - 短期先修预算查询隔离。
  - 后续拆分为 `budget.go`、`basket.go`、`wish.go`。
- Modify: `fanda-server/internal/model/*.go`
  - 必要时补充字段约束、关联和常量。
- Create: `fanda-server/migrations/004_finalize_table_model.sql`
  - 收口旧 `group_type/group_id` 与新 `table_id` 的迁移关系。
- Modify: `fanda-server/internal/service/*_test.go`
  - 补充餐桌、账号合并、订单状态、预算隔离、并发个人餐桌测试。

### 前端

- Modify: `fanda-app/src/services/api.ts`
  - 暂时保留导出 API 兼容页面。
  - 拆出 request、auth redirect、H5 mock、业务 API 的职责。
- Create: `fanda-app/src/services/request.ts`
  - 统一真实请求、Authorization、401 处理、响应校验。
- Create: `fanda-app/src/services/auth-session.ts`
  - token 读写、清理、401 跳转状态复位。
- Create: `fanda-app/src/services/h5-preview.ts`
  - H5 预览 mock，仅显式预览模式启用。
- Create: `fanda-app/src/services/table-session.ts`
  - 统一当前餐桌选择、记忆和兜底。
- Modify: `fanda-app/src/pages/dishes/index.tsx`
  - 分类切换改为参数驱动。
- Modify: `fanda-app/src/pages/plaza/index.tsx`
  - 分类/关键词搜索改为参数驱动，收敛分类类型。
- Modify: `fanda-app/src/pages/orders/create.scss`
  - fixed 弹层约束到 430px 容器。
- Modify: `fanda-app/src/app.tsx`
  - 删除生产可见调试日志。
- Modify: `fanda-app/src/types/index.ts`
  - 收敛历史兼容类型，明确 API DTO。

### 工程脚本与文档

- Modify: `scripts/start.js`
  - `db:migrate` 纳入 003/004，增加严格失败退出。
  - Windows 下隐藏或提示不支持任务。
- Modify: `scripts/setup-npm-registry.js`
  - registry 探测只接受有效状态。
- Modify: `scripts/*.test.js`
  - 增加迁移命令、console、fixed、H5 mock、版本文档检查。
- Modify: `package.json`
  - 调整重型 `postinstall`，增加显式 `bootstrap`。
- Modify: `README.md`
  - 同步真实 Go/Node 版本、迁移方式、H5 mock 说明。
- Modify: `docs/development-setup.md`
  - 同步开发环境、迁移、平台兼容、生产安全说明。
- Create: `docs/architecture.md`
  - 记录餐桌模型、权限、订单状态、账号合并、前端数据流。

---

## Phase 1：领域内核重构

### Task 1: 收口 release 登录安全

**Files:**
- Modify: `fanda-server/internal/config/config.go`
- Modify: `fanda-server/internal/service/auth.go`
- Test: `fanda-server/internal/service/auth_phone_test.go` 或新增 `fanda-server/internal/service/auth_login_test.go`

- [ ] **Step 1: 写失败测试**

在 `fanda-server/internal/service/auth_login_test.go` 新增测试，覆盖 release 模式禁止 mock code 登录：

```go
package service

import (
	"testing"

	"fanda-server/internal/config"

	"github.com/stretchr/testify/require"
)

func TestExchangeOpenIDRejectsMockInRelease(t *testing.T) {
	svc := NewAuthService(&config.Config{ServerMode: "release"})

	openID, err := svc.exchangeOpenID("wechat", "demo-code")

	require.Error(t, err)
	require.Empty(t, openID)
	require.Contains(t, err.Error(), "release")
}
```

- [ ] **Step 2: 验证测试失败**

Run:

```bash
go test ./internal/service -run TestExchangeOpenIDRejectsMockInRelease -count=1
```

Expected: FAIL，当前 `exchangeOpenID` 仍返回 `wechat_demo-code`。

- [ ] **Step 3: 实现最小修复**

修改 `fanda-server/internal/service/auth.go`：

```go
func (s *AuthService) exchangeOpenID(platform, code string) (string, error) {
	if code == "" {
		return "", errors.New("code 不能为空")
	}
	if s.cfg.ServerMode == "release" {
		return "", errors.New("release 模式必须接入真实平台 code 换 openid，禁止使用 mock openid")
	}
	return platform + "_" + code, nil
}
```

- [ ] **Step 4: 验证通过**

Run:

```bash
go test ./internal/service -run TestExchangeOpenIDRejectsMockInRelease -count=1
go test ./...
```

Expected: PASS。

- [ ] **Step 5: 检查点**

汇报修改文件、测试结果和真实平台登录仍待接入的边界，不提交代码。

### Task 2: 统一餐桌创建入口

**Files:**
- Modify: `fanda-server/internal/service/table.go`
- Modify: `fanda-server/internal/service/auth.go`
- Test: `fanda-server/internal/service/table_test.go`

- [ ] **Step 1: 写失败测试：创建情侣后可见餐桌**

在 `table_test.go` 增加测试，构造两名用户、邀请码、调用情侣加入逻辑后，校验存在 `couple` 餐桌和两条成员记录。

核心断言：

```go
require.Equal(t, "couple", table.Type)
require.Equal(t, inviterID, table.OwnerID)
require.Len(t, members, 2)
```

- [ ] **Step 2: 写失败测试：创建饭搭子后可见餐桌**

调用 `CreateBuddyGroup` 后校验：

```go
require.Equal(t, "buddy", table.Type)
require.Equal(t, ownerID, table.OwnerID)
require.Equal(t, "owner", member.Role)
```

- [ ] **Step 3: 实现 `CreateCoupleTable`**

在 `table.go` 增加方法：

```go
func (s *TableService) CreateCoupleTable(ctx context.Context, tx *gorm.DB, coupleID, inviterID, partnerID uuid.UUID) error {
	table := model.Table{
		ID:      coupleID,
		Type:    "couple",
		Name:    "情侣餐桌",
		OwnerID: inviterID,
		Status:  "active",
	}
	if err := tx.WithContext(ctx).Create(&table).Error; err != nil {
		return err
	}
	members := []model.TableMember{
		{ID: uuid.New(), TableID: coupleID, UserID: inviterID, Role: "owner", Status: "active"},
		{ID: uuid.New(), TableID: coupleID, UserID: partnerID, Role: "member", Status: "active"},
	}
	return tx.WithContext(ctx).Create(&members).Error
}
```

- [ ] **Step 4: 实现 `CreateBuddyTable` 和 `AddBuddyTableMember`**

在 `table.go` 增加方法：

```go
func (s *TableService) CreateBuddyTable(ctx context.Context, tx *gorm.DB, groupID, ownerID uuid.UUID, name string) error {
	table := model.Table{
		ID:      groupID,
		Type:    "buddy",
		Name:    name,
		OwnerID: ownerID,
		Status:  "active",
	}
	if err := tx.WithContext(ctx).Create(&table).Error; err != nil {
		return err
	}
	member := model.TableMember{ID: uuid.New(), TableID: groupID, UserID: ownerID, Role: "owner", Status: "active"}
	return tx.WithContext(ctx).Create(&member).Error
}

func (s *TableService) AddBuddyTableMember(ctx context.Context, tx *gorm.DB, groupID, userID uuid.UUID, role string) error {
	member := model.TableMember{ID: uuid.New(), TableID: groupID, UserID: userID, Role: role, Status: "active"}
	return tx.WithContext(ctx).Create(&member).Error
}
```

- [ ] **Step 5: 接入 AuthService**

在 `JoinCouple`、`CreateBuddyGroup`、`JoinBuddyGroup` 的事务内调用 `TableService` 方法，确保旧关系表和新餐桌表同事务提交。

- [ ] **Step 6: 验证**

Run:

```bash
go test ./internal/service -run 'Test.*Table|Test.*Couple|Test.*Buddy' -count=1
go test ./...
```

Expected: PASS。

- [ ] **Step 7: 检查点**

汇报餐桌创建和加入路径已同步，不提交代码。

### Task 3: 账号合并同步新权限模型

**Files:**
- Modify: `fanda-server/internal/service/auth.go`
- Test: `fanda-server/internal/service/auth_phone_test.go`

- [ ] **Step 1: 写失败测试**

在账号合并测试 schema 中补建 `tables`、`table_members`、`order_participants`，构造 source 用户拥有 personal table、table member、order participant，绑定同手机号触发合并后断言都迁移到 target。

核心断言：

```go
require.Equal(t, targetUID, table.OwnerID)
require.Equal(t, targetUID, member.UserID)
require.Equal(t, targetUID, participant.UserID)
```

- [ ] **Step 2: 实现迁移**

在 `mergeAccounts` 迁移业务数据部分补充：

```go
if err := tx.Model(&model.Table{}).Where("owner_id = ?", sourceUID).Update("owner_id", targetUID).Error; err != nil {
	tx.Rollback()
	return fmt.Errorf("迁移餐桌归属失败: %w", err)
}
if err := mergeTableMembers(tx, sourceUID, targetUID); err != nil {
	tx.Rollback()
	return err
}
if err := mergeOrderParticipants(tx, sourceUID, targetUID); err != nil {
	tx.Rollback()
	return err
}
```

新增 helper 处理唯一冲突：同一餐桌已有 target 成员时删除 source 成员，否则 update。

- [ ] **Step 3: 验证**

Run:

```bash
go test ./internal/service -run TestBindPhone -count=1
go test ./...
```

Expected: PASS。

- [ ] **Step 4: 检查点**

汇报账号合并覆盖的新表和冲突策略，不提交代码。

### Task 4: 订单状态机与数据完整性

**Files:**
- Modify: `fanda-server/internal/service/order.go`
- Test: `fanda-server/internal/service/order_test.go`

- [ ] **Step 1: 写失败测试：跨餐桌菜品不可下单**

构造两个餐桌和一个属于其他餐桌的 dish，使用当前餐桌创建订单时期待错误：

```go
_, err := svc.CreateOrder(ctx, userID, CreateOrderRequest{
	TableID: tableA,
	Items: []CreateOrderItem{{DishID: dishFromTableB, Quantity: 1}},
})
require.Error(t, err)
require.Contains(t, err.Error(), "菜品")
```

- [ ] **Step 2: 实现菜品归属校验**

在 `CreateOrder` 创建订单前批量查询：

```go
var count int64
if err := database.DB.WithContext(ctx).Model(&model.Dish{}).
	Where("id IN ? AND table_id = ? AND is_deleted = false", dishIDs, req.TableID).
	Count(&count).Error; err != nil {
	return nil, fmt.Errorf("校验菜品失败: %w", err)
}
if count != int64(len(uniqueDishIDs)) {
	return nil, errors.New("订单包含不存在或无权访问的菜品")
}
```

- [ ] **Step 3: 写失败测试：确认订单同步日历和参与人**

创建 pending 订单后调用 `ConfirmOrder`，断言 `orders.status=confirmed`、`calendar_records.status=confirmed`、当前用户参与状态为 `accepted`。

- [ ] **Step 4: 实现事务状态机**

新增私有方法：

```go
func (s *OrderService) updateOrderState(ctx context.Context, order *model.Order, nextStatus string, actorID uuid.UUID) error {
	return database.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(order).Update("status", nextStatus).Error; err != nil {
			return err
		}
		if order.CalendarRecordID != nil {
			recordStatus := mapOrderStatusToRecordStatus(nextStatus)
			if err := tx.Model(&model.CalendarRecord{}).Where("id = ?", *order.CalendarRecordID).Update("status", recordStatus).Error; err != nil {
				return err
			}
		}
		return updateParticipantForOrderState(tx, order.ID, actorID, nextStatus)
	})
}
```

- [ ] **Step 5: 验证**

Run:

```bash
go test ./internal/service -run TestOrder -count=1
go test ./...
```

Expected: PASS。

- [ ] **Step 6: 检查点**

汇报订单校验和状态联动结果，不提交代码。

### Task 5: 预算隔离与个人餐桌幂等

**Files:**
- Modify: `fanda-server/internal/service/feature.go`
- Modify: `fanda-server/internal/service/table.go`
- Test: `fanda-server/internal/service/table_test.go`

- [ ] **Step 1: 写失败测试：预算按用户隔离**

同餐桌两个用户设置同月预算，用户 A 获取预算时不能返回用户 B 的记录。

- [ ] **Step 2: 修复查询条件**

修改 `GetBudget`：

```go
if err := database.DB.Where("user_id = ? AND table_id = ? AND month = ?", uid, tableID, month).First(&budget).Error; err != nil {
	return nil, errors.New("未设置预算")
}
```

- [ ] **Step 3: 写并发测试：个人餐桌首次创建幂等**

并发调用 `EnsurePersonalTable`，断言全部成功且返回同一张 personal table。

- [ ] **Step 4: 捕获唯一冲突后重读**

在 `EnsurePersonalTable` 创建失败时，如果是唯一冲突，则重新查询并返回已有个人餐桌。

- [ ] **Step 5: 验证**

Run:

```bash
go test ./internal/service -run 'Test.*Budget|Test.*PersonalTable' -count=1
go test ./...
```

Expected: PASS。

- [ ] **Step 6: 检查点**

汇报预算隔离和并发幂等修复结果，不提交代码。

---

## Phase 2：API 与前端数据流重构

### Task 6: 拆分请求、登录态和 H5 mock

**Files:**
- Create: `fanda-app/src/services/auth-session.ts`
- Create: `fanda-app/src/services/request.ts`
- Create: `fanda-app/src/services/h5-preview.ts`
- Modify: `fanda-app/src/services/api.ts`
- Test: `scripts/api-types.test.js`
- Test: `scripts/h5-preview.test.js`

- [ ] **Step 1: 新增静态测试：H5 mock 必须有显式开关**

在 `scripts/h5-preview.test.js` 增加检查：

```js
test('H5 preview mock requires explicit preview flag', () => {
  const apiSource = readFileSync('fanda-app/src/services/h5-preview.ts', 'utf8')
  assert(apiSource.includes('ENABLE_H5_PREVIEW_MOCK'))
  assert(!/process\\.env\\.TARO_ENV === ['\"]h5['\"] && token === ['\"]h5-preview-token['\"]/.test(apiSource))
})
```

- [ ] **Step 2: 创建 `auth-session.ts`**

实现 token 和跳转状态：

```ts
import Taro from '@tarojs/taro'

let isRedirectingToLogin = false

export const getAuthToken = (): string => Taro.getStorageSync('token') || ''

export const setAuthToken = (token: string) => {
  isRedirectingToLogin = false
  Taro.setStorageSync('token', token)
}

export const clearAuthToken = () => {
  Taro.removeStorageSync('token')
}

export const resetAuthRedirect = () => {
  isRedirectingToLogin = false
}

export const redirectToLoginOnce = () => {
  if (isRedirectingToLogin) return
  isRedirectingToLogin = true
  clearAuthToken()
  Taro.reLaunch({ url: '/pages/login/index' })
}
```

- [ ] **Step 3: 创建 `h5-preview.ts`**

把现有 H5 mock 数据和 `createH5PreviewResponse` 移入新文件，启用条件改为：

```ts
const ENABLE_H5_PREVIEW_MOCK = process.env.TARO_ENV === 'h5' && process.env.NODE_ENV !== 'production'

export const isH5PreviewRequest = (token: string) => {
  return ENABLE_H5_PREVIEW_MOCK && token === 'h5-preview-token'
}
```

- [ ] **Step 4: 创建 `request.ts`**

实现统一 request，保留原 `ApiResponse<T>` 返回：

```ts
export const request = async <T>(options: Taro.request.Option): Promise<ApiResponse<T>> => {
  const token = getAuthToken()
  if (isH5PreviewRequest(token)) {
    return createH5PreviewResponse<T>(options)
  }
  const res = await Taro.request({ ...options, url: `${BASE_URL}${options.url}`, header: buildHeaders(options, token) })
  if (res.statusCode === 401) {
    redirectToLoginOnce()
    throw new Error('未登录')
  }
  return normalizeApiResponse<T>(res.data)
}
```

- [ ] **Step 5: 让 `api.ts` 只保留业务 API 导出**

从 `api.ts` 删除 request 和 mock 实现，改为从 `request.ts` 导入 `request`。

- [ ] **Step 6: 验证**

Run:

```bash
npm test
npm --prefix fanda-app run lint
npm run build:h5
```

Expected: PASS，lint 无新增 error。

- [ ] **Step 7: 检查点**

汇报拆分后的文件职责和 H5 mock 启用边界，不提交代码。

### Task 7: 页面数据流参数化

**Files:**
- Modify: `fanda-app/src/pages/dishes/index.tsx`
- Modify: `fanda-app/src/pages/plaza/index.tsx`
- Modify: `fanda-app/src/types/index.ts`

- [ ] **Step 1: 收敛广场分类类型**

修改 `types/index.ts`：

```ts
export type PlazaCategoriesResponse = string[]
```

- [ ] **Step 2: 改造菜品分类加载**

`loadDishes` 接收显式参数：

```ts
const loadDishes = useCallback(async (pageNum: number, append: boolean, options?: { tableId?: string; dishType?: string; keyword?: string }) => {
  const tableId = options?.tableId ?? activeTableId
  const dishType = options?.dishType ?? activeTab
  const nextKeyword = options?.keyword ?? searchKeyword
  // 使用 dishType 和 nextKeyword 构造 params
}, [activeTableId, activeTab, searchKeyword, loading])
```

`handleTabChange` 直接传入新分类：

```ts
const handleTabChange = (key: string) => {
  setActiveTab(key)
  setDishes([])
  setPage(1)
  setHasMore(true)
  loadDishes(1, false, { dishType: key })
}
```

- [ ] **Step 3: 改造广场分类加载**

`loadDishes` 接收显式 `category` 和 `keyword`，删除 `setTimeout`。

- [ ] **Step 4: 验证**

Run:

```bash
npm --prefix fanda-app run lint
npm run build:h5
```

Expected: PASS。

- [ ] **Step 5: 检查点**

汇报已移除闭包依赖和历史分类兼容类型，不提交代码。

### Task 8: H5 布局约束和调试日志护栏

**Files:**
- Modify: `fanda-app/src/pages/orders/create.scss`
- Modify: `fanda-app/src/app.tsx`
- Modify: `scripts/h5-preview.test.js`
- Modify: `scripts/page-types.test.js`

- [ ] **Step 1: 新增静态测试：禁止生产日志**

在 `scripts/page-types.test.js` 增加扫描 `fanda-app/src`：

```js
assert(!source.includes('console.log('), `${relativePath}: console.log`)
```

- [ ] **Step 2: 新增静态测试：fixed 禁止 `inset: 0`**

在 `scripts/h5-preview.test.js` 增加检查 `src/pages/**/*.scss`，如果同一 CSS 块包含 `position: fixed` 和 `inset: 0` 则失败。

- [ ] **Step 3: 修复订单弹层**

修改 `.sheet-mask`：

```scss
.sheet-mask {
  position: fixed;
  top: 0;
  bottom: 50px;
  left: 50%;
  width: 100%;
  max-width: 430px;
  transform: translateX(-50%);
  z-index: 120;
  display: flex;
  align-items: flex-end;
  background: rgba(25, 22, 20, 0.38);
}
```

- [ ] **Step 4: 删除启动日志**

修改 `app.tsx`：

```tsx
function App({ children }: PropsWithChildren<{}>) {
  return children
}
```

- [ ] **Step 5: 验证**

Run:

```bash
npm test
npm --prefix fanda-app run lint
npm run build:h5
```

Expected: PASS。

- [ ] **Step 6: 检查点**

汇报 H5 约束和日志护栏，不提交代码。

---

## Phase 3：工程护栏重构

### Task 9: 迁移脚本升级

**Files:**
- Create: `fanda-server/migrations/004_finalize_table_model.sql`
- Modify: `scripts/start.js`
- Modify: `scripts/start.test.js`

- [ ] **Step 1: 写脚本测试：migrate 包含 001-004 且严格失败**

在 `scripts/start.test.js` 检查：

```js
assert(source.includes('set -euo pipefail'))
assert(source.includes('001_init.sql'))
assert(source.includes('002_add_phone.sql'))
assert(source.includes('003_tables_refactor.sql'))
assert(source.includes('004_finalize_table_model.sql'))
```

- [ ] **Step 2: 新增 004 迁移**

`004_finalize_table_model.sql` 内容：

```sql
-- 004: 收口统一餐桌模型

UPDATE dishes
SET table_id = group_id
WHERE table_id IS NULL
  AND group_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = dishes.group_id);

UPDATE orders
SET table_id = group_id
WHERE table_id IS NULL
  AND group_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = orders.group_id);

UPDATE calendar_records
SET table_id = group_id
WHERE table_id IS NULL
  AND group_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = calendar_records.group_id);

ALTER TABLE dishes ALTER COLUMN table_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN table_id SET NOT NULL;
ALTER TABLE calendar_records ALTER COLUMN table_id SET NOT NULL;

ALTER TABLE dishes ALTER COLUMN group_type DROP NOT NULL;
ALTER TABLE dishes ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN group_type DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE calendar_records ALTER COLUMN group_type DROP NOT NULL;
ALTER TABLE calendar_records ALTER COLUMN group_id DROP NOT NULL;
```

- [ ] **Step 3: 修改 migrate 命令**

在 `scripts/start.js` 的 `migrateCommand` 开头加入：

```sh
set -euo pipefail
```

并追加执行 003、004。

- [ ] **Step 4: 验证**

Run:

```bash
npm test
```

Expected: PASS。

- [ ] **Step 5: 检查点**

汇报迁移脚本变化和 004 的兼容策略，不提交代码。

### Task 10: 安装和 registry 脚本收口

**Files:**
- Modify: `package.json`
- Modify: `scripts/install-deps.js`
- Modify: `scripts/setup-npm-registry.js`
- Modify: `scripts/setup-npm-registry.test.js`

- [ ] **Step 1: 写 registry 状态码测试**

增加测试：`403`、`404`、`401` 都不应选择内部源。

- [ ] **Step 2: 修复 registry 判断**

修改判断：

```js
const isUsableStatus = response.statusCode >= 200 && response.statusCode < 400
resolve(isUsableStatus)
```

- [ ] **Step 3: 调整 postinstall**

将 `package.json`：

```json
"postinstall": "node scripts/install-deps.js --skip-heavy",
"bootstrap": "node scripts/install-deps.js"
```

`install-deps.js` 中 `--skip-heavy` 只提示，不执行前端安装和 Go 下载。

- [ ] **Step 4: 验证**

Run:

```bash
npm test
```

Expected: PASS。

- [ ] **Step 5: 检查点**

汇报安装行为变化，不提交代码。

### Task 11: 前端测试入口与构建体积护栏

**Files:**
- Modify: `fanda-app/package.json`
- Create: `fanda-app/scripts/noop-test.js` 或补齐真实测试依赖
- Modify: `scripts/h5-preview.test.js`

- [ ] **Step 1: 决策前端测试入口**

初期不引入 Jest 时，将 `fanda-app` 的 `test` 改成明确的 Node 静态测试入口，而不是悬空 `jest`：

```json
"test": "node ../scripts/page-types.test.js"
```

- [ ] **Step 2: 增加 H5 构建体积文档化阈值**

在 `scripts/h5-preview.test.js` 中记录允许的入口阈值，先作为 warning 文档，不阻塞：

```js
const H5_ENTRYPOINT_WARNING_LIMIT_KIB = 244
```

- [ ] **Step 3: 验证**

Run:

```bash
npm --prefix fanda-app test
npm test
```

Expected: PASS。

- [ ] **Step 4: 检查点**

汇报前端测试入口恢复策略，不提交代码。

---

## Phase 4：文档与体验收口

### Task 12: 架构文档

**Files:**
- Create: `docs/architecture.md`
- Modify: `README.md`
- Modify: `docs/development-setup.md`

- [ ] **Step 1: 编写 `docs/architecture.md`**

包含章节：

```markdown
# 饭搭架构说明

## 领域模型
## 餐桌权限
## 账号合并
## 订单状态机
## API 契约
## 前端数据流
## H5 预览边界
## 数据库迁移
```

- [ ] **Step 2: 同步 README**

更新：

- Go 版本：与 `go.mod` 一致。
- Node 版本：`18.12` 或更高。
- 迁移命令：`npm run db:migrate` 自动执行完整迁移。
- H5 预览：只在本地显式预览模式使用 mock。

- [ ] **Step 3: 同步开发指南**

删除“手动补跑 003”的临时说明，补充生产安全配置。

- [ ] **Step 4: 验证**

Run:

```bash
npm test
```

Expected: PASS。

- [ ] **Step 5: 检查点**

汇报文档和代码约定已同步，不提交代码。

### Task 13: 最终全量验证

**Files:**
- No code changes.

- [ ] **Step 1: 运行根目录脚本测试**

Run:

```bash
npm test
```

Expected: PASS。

- [ ] **Step 2: 运行后端测试**

Run:

```bash
go test ./...
```

Expected: PASS。

- [ ] **Step 3: 运行前端 lint**

Run:

```bash
npm --prefix fanda-app run lint
```

Expected: PASS；允许已有 warning 需要在报告中列出。

- [ ] **Step 4: 运行 H5 构建**

Run:

```bash
npm run build:h5
```

Expected: PASS；体积 warning 需要在报告中列出。

- [ ] **Step 5: 输出最终报告**

报告包括：

- 修改文件清单。
- 已修复问题列表。
- 新增测试列表。
- 仍未做的二期事项。
- 所有验证命令结果。

---

## 二期事项

这些不阻塞本轮架构重构，但适合后续继续做：

- 接入真实微信/抖音 code2session。
- 引入 OpenAPI 或从后端 DTO 生成前端类型。
- 将 `FeatureService` 完整拆成 `BudgetService`、`BasketService`、`WishService`。
- 引入 PostgreSQL 容器化迁移集成测试。
- 分析 H5 chunk 来源并做懒加载或分包优化。
