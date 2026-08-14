# 饭搭本地开发环境指南

这份指南面向第一次接触前后端开发工具的读者，解释饭搭项目使用的程序、它们之间的关系，以及 macOS 和 Windows 11 上从零安装、初始化和启动项目的完整步骤。

macOS 命令在“终端”中执行。Windows 命令默认在 PowerShell 中执行，建议通过 Windows Terminal 打开 PowerShell。除非特别说明，项目命令都应在项目根目录执行。

## 系统组成

饭搭不是一个单独运行的程序，而是由多个部分协作完成：

```text
浏览器、微信小程序或抖音小程序
                 │
                 │ HTTP API 请求
                 ▼
        Go 后端 localhost:8080
                 │
                 ├── PostgreSQL：长期保存业务数据
                 └── Redis：可选缓存，当前尚未参与核心业务
```

主要端口：

| 端口 | 程序 | 用途 |
|---|---|---|
| `10086` | Taro H5 | 浏览器前端 |
| `8080` | Go 后端 | 页面、管理后台和 API |
| `5432` | PostgreSQL | 核心业务数据库 |
| `6379` | Redis | 可选缓存 |

`localhost` 表示当前电脑。端口可以理解成同一台电脑上不同程序使用的门牌号。

## 工具说明

### 终端与 PowerShell

终端通过文字命令操作电脑。

- macOS：使用系统自带的“终端”或 iTerm2
- Windows：使用 PowerShell，建议由 Windows Terminal 打开

Windows 11 自带可用的 PowerShell，不需要为运行本项目另外安装 PowerShell 7。按 Windows 键，输入 `PowerShell` 即可打开。

不要混用 PowerShell、传统命令提示符和 Git Bash 的语法。这份指南中的 Windows 命令均按 PowerShell 编写。

查看当前目录：

```text
pwd
```

进入项目根目录：

macOS：

```bash
cd /项目所在位置/fanda
```

Windows：

```powershell
cd "D:\项目所在位置\fanda"
```

Windows 路径包含空格时必须保留双引号。

### Homebrew

Homebrew 是 macOS 软件包管理器，用于安装 Node.js、Go、PostgreSQL 和 Redis。它只用于 macOS，Windows 不需要安装。

检查：

```bash
brew --version
```

没有安装时，打开 [Homebrew 官网](https://brew.sh/)，复制官网提供的安装命令并在 macOS 终端执行。

### Node.js 与 npm

Node.js 是 JavaScript 运行环境。根目录管理脚本和 Taro 前端都依赖 Node.js。

`npm` 随 Node.js 一起安装，负责：

- 读取 `package.json`
- 安装前端依赖
- 执行项目中定义的脚本
- 启动或构建 Taro 前端

检查：

```text
node -v
npm -v
```

项目要求 Node.js `18` 或更高版本。

### Go

Go 是后端使用的编程语言。Go 命令负责下载依赖、编译代码、执行测试和运行后端。

检查：

```text
go version
```

项目要求 Go `1.23` 或更高版本。

常用命令：

```text
go -C fanda-server mod download
go -C fanda-server run cmd/server/main.go
go -C fanda-server test ./...
```

`-C fanda-server` 表示先进入 `fanda-server`，再执行后面的 Go 命令。

### PostgreSQL 与 psql

PostgreSQL 是关系型数据库。用户、餐桌、菜品、订单、日历和预算等持久化数据都保存在这里。

PostgreSQL 包含两个容易混淆的部分：

- PostgreSQL 服务：真正保存和处理数据的后台程序
- `psql`：连接 PostgreSQL、输入命令和执行 SQL 文件的命令行客户端

数据库服务没有启动时，`psql` 无法连接。只安装 `psql` 也不能代替数据库服务。

检查客户端：

```text
psql --version
```

### SQL 与迁移

SQL 是操作关系型数据库的语言。例如：

```sql
CREATE DATABASE fanda;
```

数据库迁移是一组按顺序执行的 SQL 文件，用来创建和升级数据表。项目当前包含：

```text
fanda-server/migrations/001_init.sql
fanda-server/migrations/002_add_phone.sql
fanda-server/migrations/003_tables_refactor.sql
```

必须按 `001`、`002`、`003` 的顺序执行：

- `001` 创建初始业务表
- `002` 增加手机号能力
- `003` 引入统一餐桌模型、参与者和相关 `table_id`

下面的命令表示使用 `postgres` 用户连接 `fanda` 数据库，并执行一个 SQL 文件：

```text
psql -U postgres -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

### Redis

Redis 是运行在内存中的键值存储，常用于缓存、验证码、会话、计数器和临时数据。

Redis 与 Docker Desktop不是同一类工具：

- Redis：项目可能连接的具体服务
- Docker Desktop：运行容器的通用工具
- Redis 容器：通过 Docker Desktop 运行的 Redis

当前项目只在后端启动时检查 Redis 是否可连接，还没有业务代码实际读写 Redis。Redis 连接失败只会输出警告，后端仍会继续启动，因此它目前不是必需依赖。

PostgreSQL 则保存全部核心业务数据。PostgreSQL 连接失败时后端会直接停止，因此 PostgreSQL 是必需依赖。

### Docker Desktop 与 WSL 2

Docker Desktop 可以在 Windows、macOS 和 Linux 上运行容器。容器是隔离的软件运行环境，可以用来运行 Redis、PostgreSQL、Nginx 等程序。

Windows 中通常使用 WSL 2 为 Docker Desktop 提供 Linux 环境：

```text
Windows
└── WSL 2
    └── Docker Desktop
        └── Redis 容器
```

Docker Desktop 不是饭搭当前版本的必需软件。只有希望在 Windows 中运行可选 Redis，或者未来将更多依赖容器化时才需要安装。

### 环境变量与 `.env`

环境变量保存数据库地址、密码、后端端口和平台密钥。后端会读取 `fanda-server/.env`。

项目提供的 `fanda-server/.env.example` 是模板，真正使用的是复制后生成的 `.env`。

`.env` 可能包含密码和密钥，不能提交到 Git。

## 命令兼容性

根目录部分脚本依赖 macOS 的 Homebrew 和 Unix `sh`，标准 Windows PowerShell 不能直接运行所有选项。

| 命令 | macOS | Windows | 说明 |
|---|---:|---:|---|
| `npm install` | 支持 | 支持 | 安装前端和后端依赖 |
| `npm run dev:h5` | 支持 | 支持 | 启动 H5 |
| `npm run dev:server` | 支持 | 支持 | 启动 Go 后端 |
| `npm run build:h5` | 支持 | 支持 | 构建 H5 |
| `npm test` | 支持 | 支持 | 根目录脚本测试 |
| `npm run db:start` | 支持 | 不支持 | 脚本依赖 Homebrew |
| `npm run db:migrate` | 支持但不完整 | 不支持 | 脚本依赖 `sh`，且未执行 `003` |
| `node scripts/start.js redis` | 支持 | 不支持 | 脚本依赖 Homebrew |

Windows 应使用本指南提供的 PostgreSQL Windows 服务、`psql` 和 Docker 命令。

## macOS 首次安装

### 安装基础软件

安装必需工具：

```bash
brew install node go postgresql@16
```

Redis 可选：

```bash
brew install redis
```

检查：

```bash
node -v
npm -v
go version
psql --version
```

Apple Silicon Mac 如果找不到 PostgreSQL 命令：

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Intel Mac 通常使用：

```bash
echo 'export PATH="/usr/local/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 安装项目依赖

进入项目根目录：

```bash
npm install
```

根目录 `postinstall` 会：

1. 配置前端 npm 下载源
2. 在 `fanda-app` 中执行 `npm install`
3. 在 `fanda-server` 中执行 `go mod download`

自动安装失败时可以分别执行：

```bash
npm --prefix fanda-app install
go -C fanda-server mod download
```

### 创建后端配置

```bash
cp fanda-server/.env.example fanda-server/.env
```

编辑 `fanda-server/.env`：

```dotenv
SERVER_PORT=8080
SERVER_MODE=debug

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=
DB_NAME=fanda
DB_SSLMODE=disable

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

JWT_SECRET=local-development-secret
JWT_EXPIRE_HOURS=168
ADMIN_PASSWORD=admin123
CORS_ALLOW_ORIGINS=*
```

本地 `postgres` 用户有密码时，把密码填入 `DB_PASSWORD`；无密码时留空。

### 启动 PostgreSQL

使用项目入口：

```bash
npm run db:start
```

也可以直接使用 Homebrew：

```bash
brew services start postgresql@16
brew services list
```

状态为 `started` 表示服务已启动。

如果后续提示数据库角色 `postgres` 不存在，可创建本地开发角色：

```bash
createuser -s postgres
```

### 创建数据库并迁移

项目入口会创建数据库并执行 `001`、`002`：

```bash
npm run db:migrate
```

当前脚本没有执行 `003`，必须手动补充：

```bash
psql -U postgres -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

也可以手动执行完整流程：

```bash
psql -U postgres -c "CREATE DATABASE fanda;"
psql -U postgres -d fanda -f fanda-server/migrations/001_init.sql
psql -U postgres -d fanda -f fanda-server/migrations/002_add_phone.sql
psql -U postgres -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

数据库已经存在时，跳过第一条创建命令。

### 可选安装 Redis

```bash
brew services start redis
redis-cli ping
```

返回 `PONG` 表示 Redis 正常运行。不需要 Redis 时可以跳过这一节。

## Windows 首次安装

### 准备 PowerShell

Windows 11 已包含 PowerShell。

1. 按 Windows 键。
2. 输入 `PowerShell`。
3. 打开 PowerShell。
4. 输入 `$PSVersionTable.PSVersion` 检查版本。

普通项目命令不需要管理员权限。安装 WSL 2、启动系统服务或修改系统设置时，应右键 PowerShell 并选择“以管理员身份运行”。

Windows 的脚本执行策略不影响本文中的 npm、Go、PostgreSQL 和 Docker 命令，不需要为了本项目运行不明来源的 `Set-ExecutionPolicy Unrestricted`。

### 安装 Node.js

图形安装方式：

1. 打开 [Node.js 官方下载页](https://nodejs.org/en/download)。
2. 下载 Windows LTS 安装程序。
3. 运行安装程序。
4. 保留 npm 和 Add to PATH 等默认选项。
5. 安装结束后关闭并重新打开 PowerShell。

也可以使用 Windows 包管理器：

```powershell
winget install OpenJS.NodeJS.LTS
```

验证：

```powershell
node -v
npm -v
```

### 安装 Go

图形安装方式：

1. 打开 [Go 官方安装页](https://go.dev/doc/install)。
2. 下载 Windows `.msi` 安装程序。
3. 使用默认选项完成安装。
4. 关闭并重新打开 PowerShell。

也可以使用：

```powershell
winget install GoLang.Go
```

验证：

```powershell
go version
```

### 安装 PostgreSQL

1. 打开 [PostgreSQL Windows 下载页](https://www.postgresql.org/download/windows/)。
2. 选择 EDB Interactive Installer。
3. 下载 PostgreSQL 16 的 Windows x64 安装程序。
4. 运行安装程序。
5. 保留 PostgreSQL Server、Command Line Tools 和 pgAdmin。
6. 数据目录使用默认值即可。
7. 为超级用户 `postgres` 设置密码并妥善保存。
8. 端口保持默认 `5432`。
9. Locale 使用系统默认值。
10. 安装结束后可以跳过 Stack Builder。

PostgreSQL 安装程序通常会创建并自动启动 Windows 服务。

验证：

```powershell
psql --version
Get-Service -Name "postgresql*"
```

如果 `psql` 无法识别，把下面的目录加入 Windows `Path`：

```text
C:\Program Files\PostgreSQL\16\bin
```

设置步骤：

1. 在 Windows 搜索中输入“编辑系统环境变量”。
2. 打开“环境变量”。
3. 在用户变量或系统变量中选择 `Path`。
4. 点击“新建”并填写 PostgreSQL 的 `bin` 目录。
5. 保存后关闭并重新打开 PowerShell。

也可以用完整路径验证：

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" --version
```

查看服务：

```powershell
Get-Service -Name "postgresql*"
```

安装后服务通常会自动运行。需要手动启动时，以管理员身份打开 PowerShell：

```powershell
$service = Get-Service -Name "postgresql*" | Select-Object -First 1
Start-Service -Name $service.Name
```

也可以按 `Win + R`，输入 `services.msc`，找到名称以 `postgresql` 开头的服务并启动。

### 安装项目依赖

在 PowerShell 中进入项目根目录：

```powershell
cd "D:\项目所在位置\fanda"
npm install
```

自动安装失败时：

```powershell
npm --prefix fanda-app install
go -C fanda-server mod download
```

### 创建后端配置

```powershell
Copy-Item fanda-server\.env.example fanda-server\.env
```

用编辑器打开 `fanda-server\.env`。PostgreSQL Windows 安装程序要求设置 `postgres` 密码，因此必须把同一个密码填入：

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=安装PostgreSQL时设置的密码
DB_NAME=fanda
DB_SSLMODE=disable
```

同时修改本地开发密钥：

```dotenv
JWT_SECRET=local-development-secret
ADMIN_PASSWORD=admin123
CORS_ALLOW_ORIGINS=*
```

### 创建数据库并迁移

标准 Windows 环境不能使用 `npm run db:migrate`，因为该脚本依赖 Unix `sh`。请在项目根目录的 PowerShell 中执行：

```powershell
psql -U postgres -h localhost -W -c "CREATE DATABASE fanda;"
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/001_init.sql
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/002_add_phone.sql
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

`-W` 会提示输入安装 PostgreSQL 时设置的 `postgres` 密码。输入密码时终端不会显示字符，这是正常的。

数据库已经存在时，第一条命令会报错，可以忽略创建步骤并继续执行三个迁移文件。

验证：

```powershell
psql -U postgres -h localhost -W -d fanda
```

进入 `psql` 后：

```text
\dt
\d tables
\q
```

其中：

- `\dt`：查看所有数据表
- `\d tables`：查看 `tables` 表结构
- `\q`：退出 `psql`

### 可选安装 Docker Desktop

如果暂时不需要 Redis，可以跳过 Docker Desktop 和本节剩余内容。

Docker Desktop 在 Windows 上通常使用 WSL 2。安装步骤：

1. 以管理员身份打开 PowerShell。
2. 执行 `wsl --install`。
3. 按提示重启电脑。
4. 重启后执行 `wsl --update`。
5. 打开 [Docker Desktop Windows 安装页](https://docs.docker.com/desktop/setup/install/windows-install/)。
6. 下载适合当前电脑架构的安装程序。
7. 安装时使用 WSL 2 后端。
8. 启动 Docker Desktop。
9. 等待 Docker Desktop 显示 Docker Engine 已运行。

命令：

```powershell
wsl --install
```

重启后：

```powershell
wsl --update
wsl --status
docker version
```

如果 `docker version` 的 Server 部分无法连接，确认 Docker Desktop 已经启动，而不只是安装完成。

### 可选安装 Redis

Redis 官方 Windows 指南推荐通过 Docker 运行。Docker Desktop 正常后执行：

```powershell
docker run --name fanda-redis -p 6379:6379 -d redis:7
```

参数含义：

- `docker run`：创建并启动容器
- `--name fanda-redis`：容器名称
- `-p 6379:6379`：把 Windows 的 `6379` 端口映射到 Redis
- `-d`：后台运行
- `redis:7`：使用 Redis 7 镜像

验证：

```powershell
docker exec fanda-redis redis-cli ping
```

返回 `PONG` 表示 Redis 正常运行。

容器只需创建一次。以后启动和停止：

```powershell
docker start fanda-redis
docker stop fanda-redis
```

查看状态和日志：

```powershell
docker ps -a
docker logs fanda-redis
```

不再需要该容器时：

```powershell
docker stop fanda-redis
docker rm fanda-redis
```

删除容器不会卸载 Docker Desktop。

## 日常启动

数据库迁移只需在首次初始化或项目新增迁移时执行。日常开发不需要重复创建数据库。

### macOS

终端一，启动 PostgreSQL：

```bash
npm run db:start
```

终端二，启动后端：

```bash
npm run dev:server
```

终端三，启动 H5：

```bash
npm run dev:h5
```

Redis可选：

```bash
brew services start redis
```

### Windows

PostgreSQL 通常会随 Windows 自动启动。检查：

```powershell
Get-Service -Name "postgresql*"
```

如果状态不是 `Running`，以管理员身份启动：

```powershell
$service = Get-Service -Name "postgresql*" | Select-Object -First 1
Start-Service -Name $service.Name
```

PowerShell 一，启动后端：

```powershell
npm run dev:server
```

PowerShell 二，启动 H5：

```powershell
npm run dev:h5
```

使用可选 Redis 容器时：

```powershell
docker start fanda-redis
```

### 启动结果

后端启动顺序：

1. 读取 `fanda-server/.env`
2. 连接 PostgreSQL
3. 尝试连接 Redis
4. 注册 API 和静态页面
5. 监听 `8080`

看到下面的日志表示后端正常：

```text
PostgreSQL 连接成功
服务启动于 :8080
```

Redis 没启动时出现“Redis 连接失败，缓存功能将不可用”属于可忽略警告。

访问地址：

```text
H5：http://localhost:10086/
后端：http://localhost:8080/
后台：http://localhost:8080/admin/
```

H5 登录页可以点击“浏览器预览登录”。该模式使用前端内置 Mock 数据，不调用微信或抖音登录能力。

## H5 与小程序

### H5

```text
npm run dev:h5
```

Taro 会编译前端、启动开发服务器，并在源代码变化后自动重新编译。

### 微信小程序

```text
npm --prefix fanda-app run dev:weapp
```

使用微信开发者工具导入 `fanda-app/dist`。

### 抖音小程序

```text
npm --prefix fanda-app run dev:tt
```

使用抖音开发者工具导入 `fanda-app/dist`。

### 真机访问后端

开发者工具和后端在同一台电脑上时，可以使用：

```text
http://localhost:8080/api/v1
```

真机中的 `localhost` 指向手机，不是开发电脑。真机调试需要使用电脑局域网 IP，并保证手机和电脑在同一网络。

macOS 查看 IP：

```bash
ipconfig getifaddr en0
```

Windows 查看 IP：

```powershell
ipconfig
```

在输出中查找当前网卡的 IPv4 地址，然后构建：

macOS：

```bash
API_BASE_URL=http://电脑局域网IP:8080/api/v1 npm --prefix fanda-app run dev:weapp
```

Windows PowerShell：

```powershell
$env:API_BASE_URL="http://电脑局域网IP:8080/api/v1"
npm --prefix fanda-app run dev:weapp
```

正式发布必须使用符合平台要求的 HTTPS 域名。真实平台登录还需要在 `.env` 中配置 App ID 和 Secret。

## 停止服务

前端或后端在当前终端运行时，按 `Control + C` 停止。

macOS 后台服务：

```bash
brew services stop postgresql@16
brew services stop redis
```

Windows PostgreSQL 服务通常可以保持自动运行。需要停止时，以管理员身份执行：

```powershell
$service = Get-Service -Name "postgresql*" | Select-Object -First 1
Stop-Service -Name $service.Name
```

Windows Redis 容器：

```powershell
docker stop fanda-redis
```

## 验证命令

两个系统都可运行：

```text
npm test
go -C fanda-server test ./...
npm run build:h5
```

检查后端：

macOS：

```bash
curl http://localhost:8080/
```

Windows：

```powershell
Invoke-WebRequest http://localhost:8080/
```

检查端口：

macOS：

```bash
lsof -i :8080
lsof -i :10086
lsof -i :5432
lsof -i :6379
```

Windows：

```powershell
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 10086 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 6379 -ErrorAction SilentlyContinue
```

`fanda-app` 当前声明了 `npm test`，但项目尚未安装 `jest`，因此前端目录的 `npm test` 暂时不是有效验证命令。

## 常见问题

### 命令无法识别

macOS 可能显示：

```text
zsh: command not found: psql
```

Windows 可能显示：

```text
无法将“psql”项识别为 cmdlet、函数、脚本文件或可运行程序的名称
```

先确认软件已经安装，再确认安装目录已经加入 `PATH`。修改 `PATH` 后必须重新打开终端。

### PostgreSQL 拒绝连接

通常表示服务没有启动。

macOS：

```bash
brew services list
lsof -i :5432
```

Windows：

```powershell
Get-Service -Name "postgresql*"
Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
```

密码认证失败时，检查 `.env` 中的 `DB_USER`、`DB_PASSWORD`，以及 `psql` 使用的用户。

### 数据库不存在

创建数据库：

macOS：

```bash
psql -U postgres -c "CREATE DATABASE fanda;"
```

Windows：

```powershell
psql -U postgres -h localhost -W -c "CREATE DATABASE fanda;"
```

然后按顺序执行三个迁移文件。

### 缺少 `tables` 表或 `table_id`

说明没有执行 `003_tables_refactor.sql`。

macOS：

```bash
psql -U postgres -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

Windows：

```powershell
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

### 端口已被占用

后端常见错误：

```text
address already in use
```

检查 `8080` 端口：

macOS：

```bash
lsof -i :8080
```

Windows：

```powershell
Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
```

已有后端实例时可以直接使用。无关程序占用时，应停止该程序或修改 `.env` 中的 `SERVER_PORT`。

### Redis 连接失败

当前版本可以忽略 Redis 连接警告。

需要 Redis 时：

macOS：

```bash
brew services start redis
redis-cli ping
```

Windows：

```powershell
docker start fanda-redis
docker exec fanda-redis redis-cli ping
```

### Docker 无法连接

如果 `docker version` 只有 Client 信息或显示无法连接：

1. 确认 Docker Desktop 已启动。
2. 执行 `wsl --status` 检查 WSL 2。
3. 执行 `wsl --update`。
4. 重启 Docker Desktop。

### H5 页面请求失败

依次检查：

1. 后端终端是否仍在运行
2. `http://localhost:8080/` 能否打开
3. 前端 API 是否为 `http://localhost:8080/api/v1`
4. `.env` 中 `CORS_ALLOW_ORIGINS` 是否为 `*`

使用“浏览器预览登录”时，主要接口会走前端 Mock。

### npm 安装失败

先验证缓存并重新安装：

```text
npm cache verify
npm --prefix fanda-app install
```

项目的 `package-lock.json` 可能记录固定下载地址，仅修改 registry 不一定替换锁文件中的已有地址。

## 最短流程

### macOS 首次运行

```bash
brew install node go postgresql@16
npm install
cp fanda-server/.env.example fanda-server/.env
npm run db:start
npm run db:migrate
psql -U postgres -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

然后分别运行：

```text
npm run dev:server
npm run dev:h5
```

### Windows 首次运行

先通过官方安装程序安装 Node.js、Go 和 PostgreSQL 16，然后：

```powershell
npm install
Copy-Item fanda-server\.env.example fanda-server\.env
```

填写 `.env` 中的 PostgreSQL 密码，再执行：

```powershell
psql -U postgres -h localhost -W -c "CREATE DATABASE fanda;"
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/001_init.sql
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/002_add_phone.sql
psql -U postgres -h localhost -W -d fanda -f fanda-server/migrations/003_tables_refactor.sql
```

然后分别运行：

```powershell
npm run dev:server
npm run dev:h5
```

Redis 与 Docker Desktop 可以暂时不安装。
