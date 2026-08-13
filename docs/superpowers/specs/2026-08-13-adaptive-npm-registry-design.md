# 自适应 npm 源设计

## 背景

开发机器所处网络环境不同：

- 字节内部网络可以访问 `https://bnpm.byted.org/`，应优先使用内部源。
- 其他网络无法访问内部源，需要自动回退到 `https://registry.npmmirror.com/`。
- 仓库中的 `fanda-app/package-lock.json` 必须保持公开镜像地址，不能因某台机器使用内部源而产生 Git 变更。

当前脚本能够探测内部源并生成本地 `fanda-app/.npmrc`，但只写入 `registry`。锁文件中的 `resolved` 地址固定为公开镜像时，npm 不会默认将该主机替换为内部源。

## 方案

保留现有探测和回退流程，在生成的本地 `.npmrc` 中增加：

```ini
replace-registry-host=always
```

生成结果如下：

```ini
registry=<自动选择的源>
replace-registry-host=always
```

npm 安装时将锁文件中的 registry 主机替换为当前机器选择的源，但不改写仓库中的锁文件。

## 数据流

1. 执行根目录 `postinstall`、`npm run setup:registry` 或启动菜单中的 registry 任务。
2. 请求内部源的 `/-/ping`，超时时间保持 3 秒。
3. 探测成功时选择内部源，失败时选择公开镜像。
4. 将选择结果和 `replace-registry-host=always` 写入被 Git 忽略的 `fanda-app/.npmrc`。
5. 后续 npm 安装根据本地配置替换锁文件下载地址的主机。

## 错误处理

- 内部源超时、连接失败或服务异常时继续回退公开镜像。
- `--force=internal` 和 `--force=public` 的现有显式覆盖行为保持不变。
- `.npmrc` 写入失败时保持现有失败退出行为，避免继续执行来源不明确的依赖安装。

## 测试

采用测试先行：

1. 先修改 `createNpmrcContent` 的单元测试，要求生成内容包含 `replace-registry-host=always`，确认测试因功能缺失而失败。
2. 最小修改 `createNpmrcContent` 使测试通过。
3. 运行根目录全部测试。
4. 运行一次 registry 初始化，确认本地 `.npmrc` 同时包含自动选择的源和主机替换配置。
5. 确认 `package-lock.json` 未发生变化，工作区只包含预期源码和测试修改。

## 非目标

- 不修改或重新生成 `package-lock.json`。
- 不引入临时锁文件改写流程。
- 不改变内部源探测条件、超时时间或公开镜像地址。
- 不调整前端依赖安装命令。
