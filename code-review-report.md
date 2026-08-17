# 饭搭项目全量代码与文档 CR 报告

审查范围：`fanda-server`、`fanda-app/src`、`fanda-app/config`、`fanda-app/scripts`、根目录 `scripts`、`README.md`、`docs`、迁移脚本和包配置。已排除 `node_modules`、`dist`、生成的 HTML 设计产物和二进制资源。

验证命令：

- `npm test`：通过，37 个根目录脚本测试全部通过。
- `go test ./...`：通过，后端已有测试全部通过。
- `npm --prefix fanda-app run lint`：通过，但有 5 个 React Hooks 依赖警告。
- `npm run build:h5`：通过，但 H5 构建仍有入口和分包体积警告。

## 总体判断

项目当前不是“跑不起来”的状态，基础测试和构建都能通过。真正需要优先处理的是线上登录安全、统一餐桌模型数据一致性、真实数据库迁移路径、H5 mock 边界和 430px 容器约束。

## P0

### 生产登录仍是 mock openid

- 位置：`fanda-server/internal/service/auth.go`，`AuthService.Login`、`exchangeOpenID`
- 类型：安全
- 置信度：高

`exchangeOpenID` 直接返回 `platform + "_" + code`，没有调用微信/抖音服务端接口校验 `code`。如果非本地环境也走这段逻辑，攻击者可以构造任意 code 登录或创建账号。

建议：

- `release` 模式强制使用真实平台 code 换 openid。
- mock 登录只允许 debug/test，并通过显式配置开关控制。
- 增加 release 模式测试：mock code 必须失败，平台换取失败时不得创建用户和签发 JWT。

## P1

### 003 迁移未处理旧字段非空约束

- 位置：`fanda-server/migrations/001_init.sql`、`fanda-server/migrations/003_tables_refactor.sql`、`fanda-server/internal/service/dish.go`、`fanda-server/internal/service/order.go`
- 类型：迁移 / 数据库
- 置信度：高

`001_init.sql` 中多个业务表仍有 `group_type`、`group_id` 非空约束，`003_tables_refactor.sql` 只新增并回填 `table_id`，但没有删除旧字段、改 nullable 或让新代码继续写旧字段。当前服务创建菜品和订单只写 `table_id`，从 001 到 003 的真实 PostgreSQL 迁移路径上可能插入失败。

建议：

- 新增迁移：完成回填后将 `table_id` 设为非空，移除或放宽旧 `group_type/group_id`。
- 将 003 纳入自动迁移脚本。
- 增加 PostgreSQL 迁移集成测试，而不是只用手写 SQLite schema。

### 新建情侣和饭搭子未同步餐桌表

- 位置：`fanda-server/internal/service/auth.go`，`JoinCouple`、`CreateBuddyGroup`、`JoinBuddyGroup`
- 类型：业务一致性 / 权限
- 置信度：高

现有权限边界已经切到 `tables` 和 `table_members`，但运行时新建情侣关系或饭搭子组合时仍只写旧表 `couples`、`buddy_groups`、`buddy_members`。003 迁移只能处理历史数据，不能处理运行时新增数据，导致新关系在 `ListTables` 和 `CanAccessTable` 中不可见。

建议：

- 在创建情侣关系时同事务创建 `couple` 类型餐桌和两条成员记录。
- 在创建饭搭子时同事务创建 `buddy` 类型餐桌和 owner 成员记录。
- 加入饭搭子时同步写 `table_members`。
- 增加测试：创建/加入后 `ListTables` 可见，成员可访问对应餐桌。

### 手机号合并漏迁移新权限模型

- 位置：`fanda-server/internal/service/auth.go`，`mergeAccounts`
- 类型：账号合并 / 数据完整性
- 置信度：高

账号合并迁移了部分旧模型数据，但漏掉了 `tables.owner_id`、`table_members.user_id`、`order_participants.user_id`。合并后目标账号可能拿不到源账号餐桌权限，或留下指向被删除源账号的孤儿成员/参与人。

建议：

- 合并事务中补迁 `tables`、`table_members`、`order_participants`。
- 对唯一冲突做合并而不是简单 update。
- 增加合并后访问测试，覆盖个人餐桌、情侣餐桌、饭搭餐桌和订单参与人。

### 创建订单未校验菜品归属

- 位置：`fanda-server/internal/service/order.go`，`OrderService.CreateOrder`
- 类型：权限 / 数据完整性
- 置信度：高

创建订单只校验用户能否访问 `req.TableID`，没有校验每个 `DishID` 是否存在、未删除且属于当前餐桌。攻击者可以把其他餐桌菜品 UUID 放入自己的订单，造成跨餐桌引用和日历记录污染。

建议：

- 创建前批量查询 `dishes`，条件包含 `id`、`table_id`、`is_deleted = false`。
- 校验合法菜品数量与请求项一致。
- 订单金额优先从服务端菜品价格或价格快照计算，不要完全信任客户端 `unit_price`。

### 订单状态未同步日历和参与人

- 位置：`fanda-server/internal/service/order.go`，`ConfirmOrder`、`RejectOrder`、`CancelOrder`
- 类型：业务一致性
- 置信度：高

创建订单时会创建关联日历记录和参与人，但确认、拒绝、取消订单时只更新 `orders.status`。日历记录可能仍停留在 pending，参与人也可能一直是 invited。

建议：

- 用事务同步更新订单、日历记录和参与人状态。
- 明确状态映射：confirm 同步 confirmed/accepted，reject 同步 rejected/cancelled，cancel 同步 cancelled。
- 增加状态流转测试。

### H5 预览 mock 在所有 H5 构建中生效

- 位置：`fanda-app/src/services/api.ts`、`fanda-app/src/pages/login/index.tsx`
- 类型：前端鉴权 / 环境隔离
- 置信度：高

只要 `TARO_ENV === 'h5'` 且 token 是固定 `h5-preview-token`，请求就会被本地 mock 拦截。这个条件覆盖 H5 生产构建，不只是本地预览。如果 H5 部署出去，固定 token 会绕过真实后端请求。

建议：

- 增加显式 `ENABLE_H5_PREVIEW_MOCK` 开关，并只在开发预览启用。
- H5 生产包禁用浏览器预览登录入口和 mock 响应分支。
- mock token 不应作为正常登录态参与请求判断。

### 401 跳登录标记不会复位

- 位置：`fanda-app/src/services/api.ts`，`request`
- 类型：状态管理 / 登录态
- 置信度：高

`isRedirectingToLogin` 一旦置为 true，登录成功后没有复位。当前 App 生命周期内第二次遇到 401 时，可能不再清 token 或跳登录页。

建议：

- 登录成功、进入登录页或重新写 token 时复位。
- 或把“正在跳转”绑定到跳转 Promise，完成或失败后复位。

### 分类切换使用旧闭包状态

- 位置：`fanda-app/src/pages/dishes/index.tsx`、`fanda-app/src/pages/plaza/index.tsx`
- 类型：前端状态 / 业务正确性
- 置信度：高

分类切换后通过 `setTimeout` 调用加载函数，注释里希望等待 state 更新，但闭包里的 `activeTab` 或 `activeCategory` 仍可能是旧值。表现为点击新分类后请求旧分类。

建议：

- 将分类作为显式参数传入加载函数。
- 或用 `useEffect` 监听分类、餐桌、关键词变化统一触发加载。
- 不要用 `setTimeout(..., 0)` 作为 React state 同步机制。

### 订单弹层 fixed 遮罩突破 430px 容器

- 位置：`fanda-app/src/pages/orders/create.scss`，`.sheet-mask`
- 类型：H5 布局
- 置信度：高

`.sheet-mask` 使用 `position: fixed; inset: 0`，会覆盖整个浏览器视口，而不是限制在 430px 手机预览容器内。`.sheet-panel` 的 `width: 100%` 也会跟随全视口展开。

建议：

- fixed 元素统一使用 `left: 50%`、`transform: translateX(-50%)`、`width: 100%`、`max-width: 430px`。
- 需要底部避让时保留 `bottom: 50px`。
- 补充静态检查，禁止 H5 页面 fixed 块直接使用 `inset: 0`。

### 数据库迁移脚本遗漏 003 且可能掩盖失败

- 位置：`scripts/start.js`、`package.json`、`README.md`、`docs/development-setup.md`
- 类型：脚本 / 文档一致性
- 置信度：高

`npm run db:migrate` 只执行 001、002，不执行当前业务依赖的 003。脚本没有 `set -euo pipefail`，重复执行非幂等 SQL 时，前面的失败可能被后续命令掩盖。

建议：

- 将 003 纳入迁移命令。
- shell 脚本增加 `set -euo pipefail`。
- 长期建议引入迁移版本表或迁移工具。

## P2

### 预算读取未按用户过滤

- 位置：`fanda-server/internal/service/feature.go`，`GetBudget`
- 类型：隐私 / 业务正确性
- 置信度：高

`SetBudget` 按 `user_id + table_id + month` 写入，但 `GetBudget` 只按 `table_id + month` 查询。同一餐桌多个成员设置预算时，可能读到别人的预算。

建议：

- 查询条件补充 `user_id = uid`。
- 增加同餐桌双成员预算测试。

### `EnsurePersonalTable` 并发首次创建不幂等

- 位置：`fanda-server/internal/service/table.go`，`EnsurePersonalTable`
- 类型：并发 / 健壮性
- 置信度：中高

首次请求先查后插，遇到同一用户并发创建个人餐桌时，可能触发唯一索引冲突并向上返回错误。

建议：

- 使用 PostgreSQL upsert，或捕获唯一冲突后重新读取已有餐桌。
- 增加并发测试：最终只有一张 personal table，所有请求成功。

### API 响应大量强转，缺少运行时契约校验

- 位置：`fanda-app/src/services/api.ts`
- 类型：类型安全 / 契约
- 置信度：高

`request<T>` 和 H5 mock 大量使用 `as ApiResponse<T>`，真实响应也直接 `res.data as ApiResponse<T>`。泛型由调用方声明，运行时没有验证 `code/message/data` 或分页结构，容易掩盖后端契约漂移。

建议：

- 对关键响应做最小运行时校验。
- H5 mock 按 endpoint 建立显式返回类型，不要任意 `as ApiResponse<T>`。

### 广场分类类型用数组与对象交叉类型兼容历史契约

- 位置：`fanda-app/src/types/index.ts`、`fanda-app/src/pages/plaza/index.tsx`、`fanda-server/internal/handler/dish.go`
- 类型：API 契约
- 置信度：高

后端返回 `data: string[]`，前端类型却是 `string[] & { categories?: string[] }`，页面还兼容 `res.data?.categories || res.data`。这说明契约未收敛。

建议：

- 若后端保持当前结构，前端类型直接改为 `string[]`。
- 若想使用对象结构，则后端统一返回 `{ categories: string[] }`。

### 局部横向滚动与零横向溢出目标冲突

- 位置：`fanda-app/src/pages/budget/index.scss`、`fanda-app/src/pages/basket/index.scss`、`fanda-app/src/pages/wishes/index.scss`、`fanda-app/src/pages/dishes/index.scss`
- 类型：H5 体验
- 置信度：中高

多个 `.group-select`、`.tab-scroll` 使用 `overflow-x: auto`、`white-space: nowrap`、`flex-shrink: 0`。这虽然是局部横滑，但与项目对 H5 横向溢出零容忍的目标冲突。

建议：

- 优先改为换行布局。
- 若必须横滑，需作为设计确认的内部横滑组件，并隐藏滚动条和增加渐隐提示。

### 前端仍有生产可见调试日志

- 位置：`fanda-app/src/app.tsx`
- 类型：代码整洁度
- 置信度：高

启动时输出 `console.log('App launched.')`，会进入生产包。当前静态检查没有禁止 `src` 下的调试日志。

建议：

- 删除该日志，或仅在明确 dev 条件下输出。
- 根目录脚本测试增加 `src` 下 `console.log/debug/info` 检查。

### 文档版本要求与实际配置不一致

- 位置：`README.md`、`docs/development-setup.md`、`fanda-server/go.mod`、`package.json`
- 类型：文档一致性
- 置信度：高

文档写 Go 1.23+，实际 `go.mod` 是 Go 1.25；文档写 Node 18+，根 package 和依赖实际要求至少 18.12。按文档安装低版本可能在离线或严格环境失败。

建议：

- 统一 Go 版本要求为实际支持版本。
- Node 文档改为 18.12 或更高。

### 根目录 postinstall 副作用过重

- 位置：`package.json`、`scripts/install-deps.js`、`scripts/setup-npm-registry.js`
- 类型：安装体验 / CI
- 置信度：中高

根目录 `npm install` 会自动写前端 `.npmrc`、嵌套安装前端依赖、下载 Go 模块。安装根脚本依赖变成跨生态网络操作，CI、离线和只想安装根依赖的场景容易失败。

建议：

- 将重型动作从 `postinstall` 移到显式 `bootstrap` 或 `setup` 命令。
- CI 使用 `npm ci --prefix fanda-app`。
- npm 源配置改为用户主动执行。

### npm 源探测把 403/404 当作可用

- 位置：`scripts/setup-npm-registry.js`
- 类型：脚本健壮性
- 置信度：中高

探测逻辑将所有 `<500` 的状态码都视为可用。如果内部源返回 401、403 或 404，仍会写入内部源，后续安装才失败。

建议：

- 只接受 2xx 或明确可接受的 3xx。
- 最好探测实际依赖包 metadata，而不是只探测 ping。

### 前端 lint 暴露 5 个 Hooks 依赖警告

- 位置：`fanda-app/src/pages/basket/index.tsx`、`fanda-app/src/pages/budget/index.tsx`、`fanda-app/src/pages/calendar/index.tsx`、`fanda-app/src/pages/orders/create.tsx`、`fanda-app/src/pages/wishes/index.tsx`
- 类型：前端状态 / 可维护性
- 置信度：高

`eslint` 当前没有失败，但提示多个 `useEffect` 缺少加载函数依赖。这类问题容易在状态、闭包和刷新时机变化后变成真实 bug。

建议：

- 将相关加载函数用 `useCallback` 固定依赖。
- 或将 effect 依赖整理为显式状态驱动。
- 若确实只需页面初次加载，应加注释和局部禁用规则，避免误导。

### H5 构建体积超推荐阈值

- 位置：`fanda-app` 构建产物
- 类型：性能
- 置信度：高

`npm run build:h5` 成功，但 `js/40.*.js` 约 327 KiB，入口约 328 KiB，超过 244 KiB 推荐阈值。短期不阻塞，长期会影响 H5 首屏加载。

建议：

- 分析 chunk 来源，优先拆分低频页面和大依赖。
- 开启持久化缓存只改善构建速度，不改善用户加载体积。
- 若 Taro 支持，考虑路由级懒加载或进一步分包。

## 建议修复顺序

1. 先修登录安全：后端真实 code 换 openid，前端 H5 mock 只允许 dev 预览。
2. 修统一餐桌模型一致性：运行时创建/加入/账号合并同步写 `tables`、`table_members`、`order_participants`。
3. 修迁移路径：003 纳入自动迁移，补处理旧字段约束，增加 PostgreSQL 迁移测试。
4. 修订单数据完整性：菜品归属校验、金额服务端可信计算、订单状态同步日历和参与人。
5. 修 H5 体验约束：fixed 容器、局部横向滚动、生产日志和静态检查。
6. 最后处理文档/脚本一致性、Hooks 警告和构建体积。
