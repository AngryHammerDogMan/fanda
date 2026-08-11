# 餐桌模型与点单流程重构设计

## 背景

饭搭当前的点单流程过长：用户需要从首页进入新建点单，再依次选择群组类型、群组、就餐模式，最后才能选择菜品。点单是产品主功能，流程不应被关系类型和表单步骤打断。

现有代码以 `couple` 和 `buddy` 区分数据空间。这个模型无法自然表达“未绑定情侣时也可以单人使用默认菜单和点单”的产品形态，也导致前端文案里出现“情侣关系”这类对单人用户不合适的描述。

本次重构目标是把单人、情侣、饭搭统一为“餐桌”，让菜单、点单、日历、预算等核心功能围绕餐桌运行。

## 目标

1. 将底部导航调整为 `首页 / 点单 / 日历 / 我的`，把点单提升为主入口。
2. 建立统一 `tables` 模型，支持 `personal`、`couple`、`buddy` 三种餐桌类型。
3. 点单页采用外卖式下单体验：先切换餐桌和选菜，再提交下单。
4. 下单成功后同时创建 `order` 和 `calendar_record`，两者分开管理并通过关联字段打通。
5. 单人餐桌不出现邀请流程，直接按自己记一餐下单成功。
6. 多人餐桌支持自己记一餐或邀请成员一起吃。
7. 产品文档、技术方案、UI 设计稿、前端代码和后端代码保持同一套模型与文案。

## 非目标

1. 不在本次重构中实现复杂的实时聊天或通知中心。
2. 不把订单和日历记录合并成同一张表。
3. 不保留面向用户的 `couple / buddy` 技术文案。
4. 不让底部 TabBar 承载动态餐桌列表；动态餐桌只在点单页顶部或切换面板中展示。

## 产品概念

统一产品概念为 `餐桌`。

| 类型 | 默认名称 | 数量规则 | 说明 |
|---|---|---|---|
| `personal` | 我的餐桌 | 每个用户同时只能有一个 | 用户天然拥有的单人餐桌 |
| `couple` | 情侣餐桌 | 每个用户同时只能加入一个 | 绑定情侣后升级得到，绑定后提示用户重新命名 |
| `buddy` | 创建时输入名称 | 每个用户可加入多个 | 多人饭搭群组餐桌 |

所有餐桌都支持自定义名称。绑定情侣后，如果用户没有自定义过个人餐桌名称，则默认显示 `情侣餐桌`；如果用户已自定义名称，则保留原名称并提示可重新命名。

## 信息架构

底部导航调整为：

```text
首页 / 点单 / 日历 / 我的
```

原 `菜单` Tab 降级为首页入口，作为 `菜单管理`。首页仍保留签到、预算、菜篮子、心愿、最近订单和菜单管理等入口，但主下单路径从底部 `点单` 进入。

点单页顶部显示当前餐桌名称，例如：

```text
我的餐桌 ▼
```

点击后打开餐桌切换面板，展示用户可访问的餐桌：

```text
我的餐桌
情侣餐桌
周末饭搭局
公司饭搭
管理餐桌
```

切换餐桌后同步刷新菜单、分类、最近点过、已选购物车和提交上下文。切换餐桌时清空当前购物车，避免跨餐桌误下单。

## 点单流程

### 默认餐桌选择

进入点单页时：

1. 读取本地缓存 `last-order-table-id`。
2. 如果上次餐桌仍存在且当前用户仍有访问权限，默认选中上次餐桌。
3. 如果无可用记录，优先选中 `personal` 或升级后的 `couple` 餐桌。
4. 如果用户切换餐桌，更新本地缓存。

### 外卖式选菜

点单页结构：

1. 顶部餐桌名称和切换入口。
2. 搜索栏：搜索菜品、外卖、餐厅。
3. 分类栏：全部、最近点过、菜品分类、外卖、外食等。
4. 菜品列表：展示名称、分类、标签、价格、时长、餐厅等信息。
5. 数量控件：未选中显示 `+`，已选中显示 `- 数量 +`。
6. 底部购物车栏：展示已选数量、总价、`去下单`。

用户主路径：

```text
打开点单 -> 选菜 -> 去下单 -> 提交成功
```

多人餐桌下点击 `去下单` 后再选择 `自己记一餐` 或 `一起吃`。

### 单人餐桌

如果当前餐桌没有除自己以外的成员：

```text
选菜 -> 去下单 -> 创建 order + calendar_record -> 成功
```

不展示邀请入口，也不提示“暂无可邀请成员”。系统直接按 `solo` 逻辑处理。

### 多人餐桌

如果当前餐桌存在除自己以外的成员：

```text
选菜 -> 去下单 -> 选择自己记一餐 / 一起吃
```

选择 `自己记一餐`：

```text
创建 order + calendar_record
order.dine_mode = solo
不创建邀请参与人
```

选择 `一起吃`：

```text
进入成员选择弹层
列表不包含自己
默认选中除自己外的所有成员
至少选择 1 人
提交后创建 order + calendar_record + order_participants
```

## 数据模型

### tables

新增统一餐桌表。

核心字段：

```text
id
type: personal / couple / buddy
name
owner_id
status
created_at
updated_at
```

数量约束：

1. 同一用户同时只能拥有或加入一个 `personal` 餐桌。
2. 同一用户同时只能加入一个 `couple` 餐桌。
3. 同一用户可以加入多个 `buddy` 餐桌。

### table_members

新增餐桌成员表。

核心字段：

```text
id
table_id
user_id
role: owner / admin / member
status
joined_at
```

所有餐桌访问权限都通过 `table_members` 校验。个人餐桌只有本人一名成员；情侣餐桌最多两名成员；饭搭餐桌可有多名成员。

### dishes

菜品归属从 `group_type + group_id` 收敛为 `table_id`。

保留菜品类型：

```text
dish / takeout / dineout
```

### orders

订单归属从 `group_type + group_id` 收敛为 `table_id`。

核心字段：

```text
id
creator_id
table_id
dine_mode: solo / together
status: confirmed / pending / rejected / cancelled
total_amount
calendar_record_id
created_at
```

`order` 是下单记录，在下单记录页查看和管理。

### order_items

保持订单菜品快照能力。

核心字段：

```text
id
order_id
dish_id
quantity
unit_price
```

### order_participants

新增一起吃参与人表。

核心字段：

```text
id
order_id
user_id
status: invited / accepted / rejected / skipped
created_at
updated_at
```

只有 `dine_mode = together` 且存在被邀请成员时创建。列表不包含创建者本人。

### calendar_records

日历记录归属从 `group_type + group_id` 收敛为 `table_id`。

建议新增状态字段：

```text
status: pending / confirmed / cancelled
```

`calendar_record` 是用餐日历记录，在日历页查看和管理。

下单成功后必须同时创建 `order` 和 `calendar_record`。两者分开展示，通过 `orders.calendar_record_id` 和 `calendar_records.source = order` 关联。

## 订单与日历双写

下单提交由后端在同一事务内完成：

```text
创建 order
创建 order_items
创建 calendar_record
如一起吃，创建 order_participants
回写 orders.calendar_record_id
提交事务
```

状态规则：

| 场景 | order 状态 | calendar_record 状态 |
|---|---|---|
| 单人餐桌下单 | `confirmed` | `confirmed` |
| 多人餐桌自己记一餐 | `confirmed` | `confirmed` |
| 多人餐桌一起吃 | `pending` | `pending` |
| 订单取消 | `cancelled` | `cancelled` |
| 一起吃全部拒绝 | `rejected` | `cancelled` |

## 后端影响

需要新增或调整：

1. 数据库迁移：新增 `tables`、`table_members`、`order_participants`，为核心业务表增加 `table_id`。
2. 权限服务：新增 `CanAccessTable`，替代业务层的 `CanAccessGroup`。
3. 餐桌服务：管理个人餐桌、情侣餐桌、饭搭餐桌、成员、改名和切换所需列表。
4. 菜品服务：按 `table_id` 查询、创建、更新和删除菜品。
5. 订单服务：按 `table_id` 创建订单，并在事务中同步创建日历记录。
6. 日历服务：按 `table_id` 查询记录，并支持 `status`。
7. 预算、心愿、菜篮子：逐步切换到 `table_id`。
8. 旧 `couple / buddy` 接口：保留兼容或改为调用餐桌服务，避免前端继续依赖旧概念。

## 前端影响

需要新增统一类型：

```ts
TableType = 'personal' | 'couple' | 'buddy'
Table
TableMember
OrderParticipant
```

前端页面调整：

1. `app.config.ts`：底部导航从 `菜单` 改为 `点单`。
2. `pages/orders/create`：重构为主点单页，外卖式选菜和购物车体验。
3. `pages/dishes/index`：从底部 Tab 移到首页 `菜单管理` 入口，按当前餐桌管理菜单。
4. `pages/index/index`：新增或强化 `菜单管理` 入口，保留 `开始点单` 快捷入口。
5. `pages/calendar/index`：按当前餐桌或可选餐桌筛选日历记录。
6. `pages/couple/index` 和 `pages/buddy/index`：逐步调整为餐桌管理语义。
7. `services/api.ts` 和 `types/index.ts`：全部使用具体类型，禁止 `any` 和宽泛 Record。

本地缓存：

```text
last-order-table-id
```

切换餐桌时：

```text
清空购物车
刷新菜单
更新 last-order-table-id
```

## UI 设计稿影响

高保真设计需要更新：

1. 底部导航：`首页 / 点单 / 日历 / 我的`。
2. 点单页：顶部餐桌名称、餐桌切换面板、搜索栏、分类栏、菜品列表、购物车底栏。
3. 下单弹层：多人餐桌下的 `自己记一餐 / 一起吃` 选择。
4. 邀请成员弹层：不展示自己，默认选中除自己外所有成员，至少选择 1 人。
5. 首页：将菜单管理作为入口，同时保留开始点单。
6. 餐桌管理：个人餐桌、情侣餐桌、饭搭餐桌的命名与成员管理。

视觉风格继续沿用暖橙、奶油白、圆角卡片和彩色贴纸图标。

## 文档影响

需要同步更新：

1. 产品需求文档：从情侣菜单改为餐桌点单模型。
2. 前后端技术方案：以 `tables` 为核心数据模型。
3. UI 设计稿：补齐点单主流程和餐桌切换。
4. README：更新功能描述和目录说明。
5. 成本估算：如涉及后端迁移、模型重构和 UI 重绘，应调整工作量说明。

## 迁移策略

建议分阶段实施：

1. 新增 `tables` 和 `table_members`。
2. 为现有用户创建 `personal` 餐桌。
3. 将现有 `couple` 关系迁移为 `couple` 类型餐桌。
4. 将现有 `buddy_groups` 迁移为 `buddy` 类型餐桌。
5. 为 `dishes`、`orders`、`calendar_records`、预算、心愿、菜篮子补 `table_id`。
6. 后端服务改为基于 `table_id` 查询与鉴权。
7. 前端切换到 `table` API。
8. 确认无旧依赖后，再考虑清理旧字段或保留兼容字段。

## 验证范围

后端：

1. `go test ./...`
2. 餐桌权限测试：用户只能访问自己所在餐桌。
3. 数量约束测试：每个用户只能有一个个人餐桌和一个情侣餐桌。
4. 点单事务测试：创建订单失败时不得留下孤立日历记录。
5. 一起吃参与人测试：不能邀请自己，至少选择一个其他成员。

前端：

1. `npx tsc --noEmit`
2. H5 构建校验。
3. 仅针对修改文件执行 lint 或类型检查脚本。
4. H5 预览验证：底部导航、点单页、餐桌切换、购物车清空、单人直接下单、多人邀请。

文档：

1. 产品文档不再把默认单人空间称为情侣关系。
2. 技术方案统一使用 `table_id`。
3. UI 设计稿与实际底部导航一致。

## 风险

1. 这是核心模型重构，涉及数据迁移，不能只改前端文案。
2. 订单和日历双写必须在事务内完成，否则会出现订单有但日历无，或日历有但订单无的脏数据。
3. 旧接口兼容策略需要明确，否则 H5 mock、管理后台和现有页面可能同时失效。
4. 餐桌切换清空购物车会改变用户操作习惯，需要用轻提示降低困惑。

## 结论

本次应按重构处理。`tables` 是新的核心业务模型，点单页是新的主功能入口。实现时需要同步修改产品文档、技术方案、UI 设计稿、前端代码、后端代码和数据迁移脚本，不能只做页面级优化。
