# 饭搭架构说明

饭搭由 Taro 前端、Go 后端和 PostgreSQL 数据库组成。后端以统一餐桌模型作为业务归属边界，前端通过业务 API 层访问后端，并在本地 H5 预览中用显式开关启用 mock 数据。

## 领域模型

核心模型围绕“用户加入餐桌，在餐桌内管理菜品、订单和用餐记录”组织：

| 模型 | 作用 | 关键关系 |
|---|---|---|
| `users` | 平台登录用户，保存微信、抖音 openid、手机号、积分和资料 | 手机号用于跨平台账号合并 |
| `tables` | 统一餐桌，类型为 `personal`、`couple`、`buddy` | `owner_id` 指向创建者 |
| `table_members` | 餐桌成员和角色 | `table_id + user_id` 唯一 |
| `dishes` | 自做菜、外卖和外食灵感 | `table_id` 是访问边界，`owner_id` 是创建者 |
| `orders` | 点单和一起吃流程 | `table_id` 归属餐桌，`calendar_record_id` 关联日历 |
| `order_items` | 订单菜品快照 | 记录菜品、数量和下单时单价 |
| `order_participants` | 一起吃参与人状态 | `order_id + user_id` 唯一 |
| `calendar_records` | 用餐日历记录 | `table_id` 归属餐桌，`source` 标识手动或订单生成 |
| `budget_settings`、`shopping_baskets`、`wish_items` | 预算、菜篮子和心愿 | 按 `user_id` 与 `table_id` 双维度隔离 |

旧的情侣和饭搭子关系表仍保留，用于邀请码、个人资料兼容和历史关系表达；新业务访问、列表和权限判断以 `tables` 与 `table_members` 为准。

## 餐桌权限

所有餐桌内资源都复用 `CanAccessTable(ctx, uid, tableID)`。该函数只允许 `tables.status = 'active'` 且 `table_members.status = 'active'` 的成员访问。

资源级鉴权先读取资源归属，再回到餐桌边界：

```go
CanAccessDish(ctx, uid, dishID)   // 读取 dish.table_id 后校验餐桌成员
CanAccessOrder(ctx, uid, orderID) // 读取 order.table_id 后校验餐桌成员
CanAccessRecord(ctx, uid, id)     // 读取 calendar_records.table_id 后校验餐桌成员
```

餐桌生命周期由 `TableService` 承担：

- `EnsurePersonalTable` 为每个用户补齐个人餐桌，遇到唯一冲突时重新读取已有餐桌。
- `CreateCoupleTable` 在情侣加入事务中创建情侣餐桌和双方成员。
- `CreateBuddyTable` 在饭搭子创建事务中创建多人餐桌和 owner 成员。
- `AddBuddyTableMember` 在饭搭子加入事务中追加餐桌成员。
- `RenameTable` 要求调用者既能访问餐桌，又是 `tables.owner_id`。

## 账号合并

手机号是跨平台账号合并键。用户绑定已存在手机号时，`AuthService.mergeAccounts` 在一个数据库事务内把 source 用户数据迁移到 target 用户，随后删除 source 用户。

合并策略：

1. openid 先从 source 清空，再写入 target，避免唯一约束冲突。
2. 菜品、订单、日历、留言、心愿、签到、积分记录、预算、菜篮子按 `user_id` 或 `owner_id` 迁移。
3. 双方都有 active 个人餐桌时保留 target 餐桌，把 source 餐桌资源迁入 target；同月预算冲突保留 target 记录。
4. source 的其他餐桌 `owner_id` 改为 target。
5. `table_members` 若 target 已经在同一餐桌中，则删除 source 成员；否则把成员迁移到 target。
6. `order_participants` 使用同样的冲突策略，避免同一订单重复参与人。
7. `order_votes`、情侣关系、规范化情侣成员、饭搭子成员、饭搭子群主和邀请码同步迁移。
8. 积分采用累加策略，把 source 积分加到 target。

这条路径保证账号合并后，统一餐桌权限和订单参与关系不会残留到被删除用户。

## 订单状态机

订单状态字段为 `orders.status`，当前使用的状态包括：

| 状态 | 进入条件 | 关联影响 |
|---|---|---|
| `confirmed` | 单人点单直接创建；或参与人确认 pending 订单 | 关联日历记录为 `confirmed` |
| `pending` | 一起吃订单创建且包含参与人 | 关联日历记录为 `pending`，参与人为 `invited` |
| `rejected` | 非创建者拒绝 pending 订单 | 关联日历记录改为 `cancelled`，参与人改为 `rejected` |
| `cancelled` | 创建者取消未确认订单 | 关联日历记录改为 `cancelled`，参与人改为 `skipped` |
| `voted` | 饭搭子投票场景 | 投票明细写入 `order_votes` |

`CreateOrder` 会先校验创建者属于目标餐桌，再校验参与人也属于同一餐桌。订单菜品必须来自同一 `table_id` 且未删除；跨餐桌菜品会返回“订单包含不存在或无权访问的菜品”。

状态流转通过 `updateOrderState` 在事务中同时更新：

- `orders.status`
- `calendar_records.status`
- `order_participants.status`

因此订单、日历和参与人不会出现部分更新。

## 金额数据流

金额按参考信息、用户确认和业务汇总分层：

```text
dishes.price
  -> order_items.unit_price 下单时的参考金额快照
  -> order_items.confirmed_amount 用户填写的本次确认金额（该订单项合计）
  -> orders.total_amount 订单项确认金额汇总
  -> calendar_records.amount 订单来源日历的同步金额
```

创建订单时，服务端从当前菜品读取 `dishes.price` 并保存为不可变的 `order_items.unit_price`，前端提交的 `confirmed_amount` 表示该订单项本次合计金额。`quantity` 只参与前端默认值计算，汇总时不再相乘，因此后续修改菜品参考金额也不会影响历史订单。

确认金额可以为空或为 `0`：全部为空时订单和日历金额为空，存在已填写项时只汇总非空值，`0` 保持为有效金额。创建订单或修改订单项时，订单项、`orders.total_amount` 和 `calendar_records.amount` 在同一数据库事务内更新。

订单来源日历不能直接修改总金额，只能修改关联订单的逐项确认金额；服务端随后读取该订单的全部订单项重新汇总，并同步订单与日历。手工日历记录没有关联订单项，仍可直接修改本餐金额。

## API 契约

后端 API 以 `/api/v1` 为前缀，统一返回：

```ts
interface ApiResponse<T> {
  code: number
  message: string
  data: T
}
```

认证使用 JWT，前端在真实请求中发送：

```text
Authorization: Bearer <token>
```

关键契约：

- `POST /auth/login` 使用平台 `code` 和 `platform` 登录，release 模式禁止使用开发 mock code。
- `POST /auth/bind-phone` 绑定手机号，手机号已存在时触发账号合并。
- `GET /tables` 返回当前用户所有 active 餐桌，并补齐个人餐桌。
- `PUT /tables/:id` 仅餐桌 owner 可重命名。
- `GET /dishes`、`POST /dishes`、`GET /orders`、`POST /orders`、`GET /calendar/records` 等业务接口均要求显式 `table_id`。
- 订单创建载荷使用 `table_id`、`dine_mode`、`items` 和可选 `participant_ids`、`basket_items`，不再使用旧 `group_type/group_id`。

前端类型集中在 `fanda-app/src/types/index.ts`，业务 API 集中在 `fanda-app/src/services/api.ts`。`api.ts` 只暴露业务函数，不直接处理 Taro 请求、token 或 H5 mock。

## 前端数据流

前端服务层拆成四类职责：

```text
页面
  │
  ▼
fanda-app/src/services/api.ts          业务 API：authAPI、tableAPI、dishAPI、orderAPI 等
  │
  ▼
fanda-app/src/services/request.ts      真实请求、Authorization、401 跳转、响应校验
  ├── auth-session.ts                  token 读写、清理、登录跳转去重
  └── h5-preview.ts                    H5 预览 mock 响应
```

餐桌选择由页面显式传递 `table_id`，并用 `fanda-app/src/utils/table.ts` 管理本地记忆：

- `getPrimaryTable` 优先选择个人或情侣餐桌。
- `getStoredTableId` 复用上次点单餐桌，失效时回到主餐桌。
- `rememberTableId` 在用户选择后写入本地存储。

页面加载菜品、广场搜索和订单列表时应把分类、关键词、页码和 `table_id` 作为参数传入请求函数，避免依赖 React 状态闭包中的旧值。

## H5 预览边界

H5 mock 只服务本地浏览器预览，不属于生产能力。构建配置将环境条件计算为 `H5_PREVIEW_MOCK_ENABLED`，登录页与请求层共同通过 `fanda-app/src/services/h5-preview-mode.ts` 读取：

```ts
isH5PreviewEnabled() === H5_PREVIEW_MOCK_ENABLED
```

同时还要求 token 为 `h5-preview-token`。真实请求路径仍由 `request.ts` 使用 `API_BASE_URL` 访问后端；mock 只在上述条件全部满足时拦截并返回内置演示数据。

生产构建必须保持：

- 不设置 `ENABLE_H5_PREVIEW_MOCK=true`。
- 不依赖 `h5-preview-token` 登录。
- 不在前端源代码保留 `console.log` 调试输出。
- H5 fixed 元素约束在 430px 预览容器内，避免浮层扩展到浏览器整屏。

## 数据库迁移

迁移文件位于 `fanda-server/migrations`，按序执行：

1. `001_init.sql` 创建初始业务表。
2. `002_add_phone.sql` 增加手机号能力。
3. `003_tables_refactor.sql` 引入统一餐桌、餐桌成员、订单参与人和各业务表的 `table_id`。
4. `004_finalize_table_model.sql` 把旧 `group_id` 数据回填到 `table_id`，把核心业务表的 `table_id` 收紧为非空，并放宽旧 `group_type/group_id` 的非空要求。
5. `005_couple_members.sql` 规范化情侣成员，并对 active 用户建立跨 `user1_id/user2_id` 的统一唯一约束。
6. `006_order_item_confirmed_amount.sql` 新增订单项确认金额，按历史 `unit_price × quantity` 回填，再以订单项确认金额汇总 `orders.total_amount` 并同步关联的 `calendar_records.amount`。

macOS 和 Windows 都使用：

```bash
npm run db:migrate
```

该命令读取 `fanda-server/.env`，使用 `schema_migrations` 保存版本与校验和，并用 PostgreSQL advisory lock 防止并发迁移。每个未应用版本在独立事务中执行；已手动执行 `001` 到 `004` 的旧数据库需要先运行 `go -C fanda-server run cmd/migrate/main.go -baseline 004`，验证结构后登记历史版本。
