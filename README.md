# 饭搭 Fanda

饭搭是围绕个人、情侣和饭搭餐桌的菜单管理与点单项目。前端可以运行在浏览器、微信小程序和抖音小程序中，后端负责业务逻辑，PostgreSQL 保存核心数据，Redis 提供可选缓存。

第一次接触 Node.js、Go、PostgreSQL、`psql`、Redis 或 Docker Desktop 时，请先阅读 [完整开发环境指南](docs/development-setup.md)。指南包含概念说明、macOS 与 Windows 安装步骤、数据库迁移、日常启动和常见问题。

## 项目能力

- 餐桌模型：支持个人、情侣和多人饭搭餐桌
- 快捷点单：选择菜品、生成订单并同步用餐记录
- 菜单管理：管理自做菜、外卖和外食灵感
- 用餐日历：按日期查看记录和消费统计
- 预算与菜篮子：记录月度预算和待购买食材
- 后台管理：管理用户、菜单、订单和用餐记录

## 项目结构

```text
fanda/
├── fanda-app/                  # Taro + React + TypeScript 前端
├── fanda-server/               # Go + Gin + GORM 后端
│   ├── cmd/server/             # 后端入口
│   ├── internal/               # 配置、数据库、接口和业务代码
│   ├── migrations/             # PostgreSQL 迁移文件
│   └── static/                 # 后端首页和管理后台
├── scripts/                    # 根目录安装、启动和测试脚本
├── docs/
│   └── development-setup.md    # macOS 与 Windows 完整环境指南
├── package.json                # 根目录统一命令入口
└── README.md
```

## 运行结构

```text
浏览器或小程序
      │
      │ HTTP API
      ▼
Go 后端 localhost:8080
      │
      ├── PostgreSQL localhost:5432，必需
      └── Redis localhost:6379，可选
```

主要地址：

| 地址 | 用途 |
|---|---|
| `http://localhost:10086/` | H5 前端 |
| `http://localhost:8080/` | 后端首页 |
| `http://localhost:8080/api/v1` | 后端 API |
| `http://localhost:8080/admin/` | 管理后台 |

## 环境要求

| 工具 | 要求 | 是否必需 |
|---|---|---:|
| Node.js | `18` 或更高 | 是 |
| npm | 随 Node.js 安装 | 是 |
| Go | `1.23` 或更高 | 是 |
| PostgreSQL | `14` 或更高，推荐 `16` | 是 |
| Redis | 推荐 `7` | 否 |
| Docker Desktop | Windows 运行可选 Redis 时使用 | 否 |

完整安装步骤：

- [macOS 首次安装](docs/development-setup.md#macos-首次安装)
- [Windows 首次安装](docs/development-setup.md#windows-首次安装)
- [Redis、Docker Desktop 与 WSL 2 说明](docs/development-setup.md#redis)

## 首次初始化

### macOS

安装基础工具：

```bash
brew install node go postgresql@16
```

在项目根目录安装依赖并创建配置：

```bash
npm install
cp fanda-server/.env.example fanda-server/.env
```

编辑 `fanda-server/.env` 后启动数据库并迁移：

```bash
npm run db:start
npm run db:migrate
psql -U postgres -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

当前 `npm run db:migrate` 只执行 `001`、`002`，因此必须手动补跑 `003_tables_refactor.sql`。

### Windows

先按照 [Windows 首次安装](docs/development-setup.md#windows-首次安装) 安装 Node.js、Go 和 PostgreSQL 16。

在项目根目录的 PowerShell 中执行：

```powershell
npm install
Copy-Item fanda-server\.env.example fanda-server\.env
```

将 PostgreSQL 安装时设置的 `postgres` 密码填入 `fanda-server\.env` 的 `DB_PASSWORD`，然后执行：

```powershell
psql -U postgres -h localhost -W -c "CREATE DATABASE fanda;"
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/001_init.sql
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/002_add_phone.sql
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

Windows 不使用 `npm run db:start` 和 `npm run db:migrate`，因为这两个脚本依赖 macOS 的 Homebrew 或 Unix `sh`。

## 日常启动

### macOS

分别打开三个终端：

```bash
# 终端一
npm run db:start

# 终端二
npm run dev:server

# 终端三
npm run dev:h5
```

### Windows

PostgreSQL 安装程序通常会让数据库服务随 Windows 自动启动。打开两个 PowerShell：

```powershell
# PowerShell 一
npm run dev:server

# PowerShell 二
npm run dev:h5
```

如果 PostgreSQL 没有运行，请参考 [Windows PostgreSQL 服务启动方法](docs/development-setup.md#安装-postgresql)。

启动后打开 `http://localhost:10086/`。H5 登录页可以使用“浏览器预览登录”，该模式使用前端内置 Mock 数据。

## Redis 说明

Redis 当前是可选依赖。后端启动时会检查 Redis，但现有业务代码还没有实际读写 Redis；连接失败只会输出警告，不会阻止后端运行。

- macOS 可以通过 Homebrew 直接安装 Redis。
- Windows 可以暂时跳过 Redis。
- Windows 需要 Redis 时，可安装 Docker Desktop，通过容器运行 Redis。
- Docker Desktop 是容器运行工具，不是 Redis 本身。

完整说明和安装步骤见 [开发环境指南的 Redis 章节](docs/development-setup.md#redis)。

## 命令兼容性

| 命令 | macOS | Windows | 用途 |
|---|---:|---:|---|
| `npm install` | 支持 | 支持 | 安装项目依赖 |
| `npm run dev:h5` | 支持 | 支持 | 启动 H5 |
| `npm run dev:server` | 支持 | 支持 | 启动后端 |
| `npm run build:h5` | 支持 | 支持 | 构建 H5 |
| `npm test` | 支持 | 支持 | 根目录脚本测试 |
| `npm run db:start` | 支持 | 不支持 | macOS Homebrew 脚本 |
| `npm run db:migrate` | 支持但缺少 `003` | 不支持 | 依赖 Unix `sh` |
| `node scripts/start.js redis` | 支持 | 不支持 | macOS Homebrew 脚本 |

## 小程序开发

微信小程序：

```text
npm --prefix fanda-app run dev:weapp
```

抖音小程序：

```text
npm --prefix fanda-app run dev:tt
```

使用对应平台开发者工具导入 `fanda-app/dist`。

真机中的 `localhost` 指向手机自身，不能访问开发电脑。真机调试的 API 地址设置和局域网 IP 获取方式见 [真机访问后端](docs/development-setup.md#真机访问后端)。

## 构建与测试

```text
npm test
go -C fanda-server test ./...
npm run build:h5
```

`fanda-app` 当前缺少 `jest`，因此前端目录的 `npm test` 暂时不可用。

## 相关文档

- [完整开发环境指南](docs/development-setup.md)
- [餐桌点单重构设计](docs/superpowers/specs/2026-08-11-table-order-refactor-design.md)
- [自适应 npm 源设计](docs/superpowers/specs/2026-08-13-adaptive-npm-registry-design.md)

## License

MIT
