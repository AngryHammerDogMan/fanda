# 确定性审查问题修复计划

> **执行要求：** 按 TDD 顺序逐项执行：先写失败测试并确认失败原因，再做最小实现，最后执行模块回归。禁止自动提交或推送 Git。

**目标：** 修复本次代码审查中确认的前端类型、账号合并、数据库迁移、OpenAPI、静态后台、H5 预览、异步竞态、重复提交、测试入口和文档一致性问题。

**架构：** 后端继续使用 Go、GORM 和 PostgreSQL；迁移改为 Go 版本化执行器，并从 `.env` 读取连接配置。OpenAPI 仍由根目录脚本生成，但统一基础路径、日历响应和 OpenAPI 3.0 空值表达。前端只做局部修复，复用 Taro、现有请求层和具体业务类型。

**技术栈：** Go、GORM、PostgreSQL、Node.js Test Runner、Taro、React、TypeScript、OpenAPI 3.0.3。

---

## 文件边界

- 后端账号与约束：`fanda-server/internal/service/auth.go`、相关测试、`fanda-server/migrations/005_*.sql`
- 迁移执行：`fanda-server/cmd/migrate/main.go`、`fanda-server/internal/migrate/*`、`scripts/start.js`
- OpenAPI：`scripts/generate-openapi.js`、`scripts/openapi-generation.test.js`、`docs/openapi.json`、`fanda-app/src/types/generated-api.ts`
- 日历契约：`fanda-server/internal/handler/calendar.go`、相关 handler 测试、`fanda-app/src/services/api.ts`
- 静态后台：`fanda-server/static/admin/index.html`、根目录静态检查测试
- 前端：`fanda-app/src/pages/dishes/*`、`fanda-app/src/pages/calendar/*`、`fanda-app/src/pages/plaza/*`、`fanda-app/src/pages/login/index.tsx`、`fanda-app/src/services/*`
- 工程与文档：根和前端 `package.json`、`README.md`、`docs/development-setup.md`、`docs/architecture.md`

## 任务一：前端类型与提交防重

- [ ] 新增静态测试，断言 `DishPayload['dish_type']` 被用于 `dishType` 状态。
- [ ] 运行测试并确认当前实现失败。
- [ ] 收紧 `dishType` 类型，确保 `tsc --noEmit` 通过。
- [ ] 新增测试，断言提交函数在 `submitting` 时早退且按钮不再绑定点击。
- [ ] 运行测试并确认当前实现失败。
- [ ] 增加逻辑与视图双重防重。
- [ ] 运行前端测试、类型检查和 lint。

## 任务二：H5 预览模式一致性

- [ ] 新增测试，断言登录页与请求层使用同一个预览模式判断。
- [ ] 运行测试并确认当前登录页把所有 H5 错判为预览。
- [ ] 从 H5 预览模块导出统一判断，登录页和请求层共同复用。
- [ ] 验证生产 H5 不写入 `h5-preview-token`，显式开发开关仍可启用 mock。

## 任务三：前端请求竞态

- [ ] 新增 latest-request-wins 工具测试，构造旧请求晚于新请求完成的场景。
- [ ] 运行测试并确认缺少代际控制时测试失败。
- [ ] 实现无 `any` 的请求代际控制器。
- [ ] 菜品列表、广场列表、日历月份和日期请求接入独立 requestId。
- [ ] 旧请求不得更新数据、分页、loading 或错误状态。
- [ ] 运行页面静态测试、类型检查、lint 和 H5 构建。

## 任务四：账号合并个人餐桌

- [ ] 新增服务测试，构造 source 与 target 各有一张 active personal table。
- [ ] 运行测试并确认当前全量更新 `tables.owner_id` 会冲突。
- [ ] 在事务内锁定并识别双方个人餐桌。
- [ ] 保留 target 个人餐桌，把 source 个人餐桌下资源迁入 target。
- [ ] 处理成员和唯一键冲突后删除 source 个人餐桌，再迁移其他餐桌 owner。
- [ ] 运行账号合并和全量 Go 测试。

## 任务五：情侣跨列唯一约束

- [ ] 新增迁移静态测试，断言存在规范化 `couple_members` 与 active user 唯一索引。
- [ ] 运行测试并确认当前两个独立索引无法满足要求。
- [ ] 新增 `005` 迁移，检查历史冲突、回填情侣成员并创建部分唯一索引。
- [ ] 情侣创建事务同步写入 `couple_members`。
- [ ] 保留旧字段兼容读取，但数据库唯一性以 `couple_members` 为准。
- [ ] 运行 Go 测试和迁移静态测试。

## 任务六：版本化数据库迁移

- [ ] 新增迁移执行器单元测试：顺序、跳过已执行版本、失败不登记、校验和漂移报错。
- [ ] 运行测试并确认迁移执行器尚不存在。
- [ ] 实现 `schema_migrations`、SHA-256、单迁移事务和 PostgreSQL advisory lock。
- [ ] 新增 `cmd/migrate`，复用服务端 `.env` 与数据库配置。
- [ ] 将 `db:migrate` 从硬编码 shell 改为 Go 迁移命令。
- [ ] 更新 `start.test.js`，断言不再包含硬编码 `postgres/fanda`。
- [ ] 运行迁移、配置、根脚本测试。

## 任务七：OpenAPI 与日历契约

- [ ] 新增测试，禁止 `servers` 和 `paths` 重复 `/api/v1`。
- [ ] 新增测试，OpenAPI 3.0.3 不得出现 `type: "null"`。
- [ ] 新增测试，日历列表契约与 handler 实际响应一致，日期参数必须必填。
- [ ] 运行测试并确认三类问题都能失败。
- [ ] 路径改为相对 `/api/v1` 的 `/auth/login`、`/tables` 等。
- [ ] OpenAPI 3.0 空数据改为 `nullable: true` 的合法 schema。
- [ ] 日历列表统一为数组响应，并同步生成 TypeScript 类型。
- [ ] 重新生成 `docs/openapi.json` 和 `generated-api.ts`。
- [ ] 运行 OpenAPI、类型和 handler 测试。

## 任务八：静态后台

- [ ] 新增静态测试，断言删除菜品使用 DELETE method。
- [ ] 新增静态测试，断言列表不再读取 `group_type`。
- [ ] 运行测试并确认当前实现失败。
- [ ] 将后台 `api` 拆分 query 与 fetch options。
- [ ] 删除操作传递真实 DELETE；列表显示 `table_id`，缺失值显示 `-`。
- [ ] 运行根目录测试。

## 任务九：检查入口与文档

- [ ] 新增测试，断言前端存在 `typecheck` 和统一 `check` 命令。
- [ ] 运行测试并确认当前入口缺失。
- [ ] 增加 `typecheck`、`check`，根测试校验该入口。
- [ ] README 明确普通 `npm install` 只做轻量 postinstall，首次完整初始化运行 `npm run bootstrap`。
- [ ] README 和开发指南改为版本化迁移说明，并说明读取 `.env`。
- [ ] 架构文档同步 OpenAPI 路径、日历数组响应和 H5 预览判断。
- [ ] 执行文案 diff，确认没有无关文案变化。

## 最终验证

- [ ] `npm test`
- [ ] `go -C fanda-server test -count=1 ./...`
- [ ] `go -C fanda-server vet ./...`
- [ ] `go -C fanda-server test -race ./internal/service`
- [ ] `npm --prefix fanda-app run check`
- [ ] `npm run build:h5`
- [ ] 检查新增 `any`、`interface{}`、`console.log` 和无关改动。
- [ ] 检查 `git diff --check` 与 `git status --short`。
