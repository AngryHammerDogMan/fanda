# 自适应 npm 源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每台开发机根据网络环境自动选择字节内部源或公开镜像，并确保 npm 对锁文件中的固定下载主机应用本机选择，同时保持 `package-lock.json` 不变。

**Architecture:** 保留 `scripts/setup-npm-registry.js` 现有探测和回退流程，只扩展生成的本地 `fanda-app/.npmrc`，加入 npm 原生的 `replace-registry-host=always`。通过现有 Node.js 单元测试锁定生成内容，再运行真实初始化命令验证本地配置和锁文件稳定性。

**Tech Stack:** Node.js 18+、`node:test`、npm 配置

---

### Task 1: 生成支持锁文件主机替换的本地 npm 配置

**Files:**
- Modify: `scripts/setup-npm-registry.test.js:32-40`
- Modify: `scripts/setup-npm-registry.js:16-23`
- Verify: `fanda-app/.npmrc`
- Verify unchanged: `fanda-app/package-lock.json`

- [ ] **Step 1: 写入失败测试**

在 `creates local npmrc content with generated-file warning` 测试中增加对主机替换配置的断言：

```js
test('creates local npmrc content with generated-file warning', () => {
  const content = createNpmrcContent(PUBLIC_REGISTRY)

  assert.match(content, /自动生成/)
  assert.match(content, /不要提交到 Git/)
  assert.match(content, new RegExp(`registry=${PUBLIC_REGISTRY}`))
  assert.match(content, /^replace-registry-host=always$/m)
})
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```bash
node --test scripts/setup-npm-registry.test.js
```

Expected: FAIL，失败断言为生成内容中缺少 `replace-registry-host=always`。

- [ ] **Step 3: 写入最小实现**

在 `createNpmrcContent` 返回的配置数组中，将主机替换配置放在 `registry` 之后：

```js
function createNpmrcContent(registry) {
  return [
    '# 本文件由 npm run setup:registry 自动生成，仅用于本机安装依赖。',
    '# 不要提交到 Git；仓库锁文件应保持使用公开镜像源。',
    `registry=${normalizeRegistry(registry)}`,
    'replace-registry-host=always',
    '',
  ].join('\n')
}
```

- [ ] **Step 4: 运行专项测试并确认 GREEN**

Run:

```bash
node --test scripts/setup-npm-registry.test.js
```

Expected: 6 个 registry 单元测试全部 PASS。

- [ ] **Step 5: 运行完整脚本测试**

Run:

```bash
npm test
```

Expected: 根目录全部 Node.js 测试 PASS。

- [ ] **Step 6: 验证真实内部源配置**

Run:

```bash
npm run setup:registry -- --force=internal
npm --prefix fanda-app config get registry
npm --prefix fanda-app config get replace-registry-host
```

Expected:

```text
https://bnpm.byted.org/
always
```

- [ ] **Step 7: 验证真实公开源配置**

Run:

```bash
npm run setup:registry -- --force=public
npm --prefix fanda-app config get registry
npm --prefix fanda-app config get replace-registry-host
```

Expected:

```text
https://registry.npmmirror.com/
always
```

- [ ] **Step 8: 恢复自动选择并检查锁文件**

Run:

```bash
npm run setup:registry
git diff --exit-code -- fanda-app/package-lock.json
git status --short
```

Expected:

- 自动选择当前网络可用的源。
- `package-lock.json` 没有差异。
- 工作区只包含设计文档、实施计划、脚本和测试的预期改动。

- [ ] **Step 9: 等待明确的 Git 指令**

不要执行 `git commit` 或 `git push`。完成修改和验证后汇报结果，仅在用户明确要求时提交或推送。
