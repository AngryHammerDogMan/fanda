# 🍽️ 饭搭 (Fanda)

> 情侣和饭搭子的点菜小程序 —— 一起决定吃什么，不再纠结！

## 项目结构

```
fanda/
├── fanda-app/          # 小程序前端（Taro 4 + React 18 + TypeScript + Sass）
├── fanda-server/       # 后端服务（Go + Gin + GORM + PostgreSQL）
├── tech-plan/          # 技术方案文档
├── ui-design-spec/     # UI 设计规范
├── cost-estimation/    # 成本估算
└── couple-menu-prd/    # 产品需求文档
```

## 功能特性

- 🔐 **微信/抖音双平台登录** — 手机号绑定，跨平台数据互通
- 🍳 **菜品管理** — 自定义菜品、外卖、外食分组
- 🎲 **随机点菜** — 选择困难症的终极解决方案
- 📋 **订单管理** — 点菜记录追踪
- 📅 **用餐记录** — 消费统计与预算管理
- 🛠️ **后台管理** — 数据仪表盘，用户/菜品/订单管理

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Taro 4.2 + React 18 |
| UI 样式 | Sass |
| 后端框架 | Go + Gin |
| 数据库 | PostgreSQL |
| 缓存 | Redis（可选） |
| 认证 | JWT |

## 快速开始

### 环境要求

- Node.js >= 18
- Go >= 1.23
- PostgreSQL >= 14
- Redis（可选，缓存用）

### 1. 数据库初始化

```bash
# 初始化 PostgreSQL 数据目录（仅首次）
initdb -D C:\pgsql\pgsql\data -U postgres --auth=trust --encoding=UTF8

# 注册为 Windows 服务（开机自启）
pg_ctl register -N PostgreSQL -D C:\pgsql\pgsql\data -S auto

# 启动服务
net start PostgreSQL

# 创建数据库
psql -U postgres -c "CREATE DATABASE fanda;"

# 运行迁移
psql -U postgres -d fanda -f fanda-server/migrations/001_init.sql
psql -U postgres -d fanda -f fanda-server/migrations/002_add_phone.sql
```

### 2. 后端启动

```bash
cd fanda-server

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入数据库连接信息、JWT_SECRET 和 ADMIN_PASSWORD

# 安装依赖 & 运行
go mod tidy
go run cmd/server/main.go
# 服务运行在 http://localhost:8080
# 后台管理 http://localhost:8080/admin/
```

### 3. 前端启动

```bash
cd fanda-app

# 安装依赖
npm install

# 微信小程序开发模式（默认请求 http://localhost:8080/api/v1）
npm run dev:weapp

# 抖音小程序开发模式
npm run dev:tt

# 生产构建时指定后端 API 地址
API_BASE_URL=https://your-domain.com/api/v1 npm run build:weapp
```

用微信/抖音开发者工具导入 `fanda-app/dist` 目录即可预览。

## 后台管理

访问 `http://localhost:8080/admin/`。后台密码通过 `fanda-server/.env` 中的 `ADMIN_PASSWORD` 配置，生产环境不要使用默认或弱密码。

## License

MIT
