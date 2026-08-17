# Pull Risk Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not create Git commits.

**Goal:** 修复拉取后识别出的五个工程化与交互风险，同时保持 Node 18.12 兼容和现有页面视觉。

**Architecture:** 使用最小增量修复。工程化问题通过依赖版本、根目录 Husky 依赖和安装脚本判断逻辑解决；前端页面问题只修改相关组件局部状态与滚动组件，不重构页面结构。

**Tech Stack:** Node.js、npm、Husky、lint-staged、Taro React、TypeScript、SCSS、node:test。

---

## 文件结构

- 修改 `package.json`：声明 Node `>=18.12`，将 Husky 放到根目录 `devDependencies`。
- 修改 `package-lock.json`：同步根目录 Husky 依赖。
- 修改 `fanda-app/package.json`：固定 `lint-staged` 为 `15.5.2`。
- 修改 `fanda-app/package-lock.json`：同步 `lint-staged` 降级。
- 修改 `scripts/install-deps.js`：比较前端 `package.json` 和 `package-lock.json`，源初始化不再因 `.npmrc` 存在而跳过。
- 修改 `scripts/start.test.js`：更新安装步骤预期。
- 新建或修改 `scripts/install-deps.test.js`：覆盖依赖是否过期、锁文件变化和强制执行逻辑。
- 修改 `fanda-app/src/pages/dishes/index.tsx`：菜品类型标签恢复 Taro `ScrollView scrollX`。
- 修改 `fanda-app/src/pages/dishes/index.scss`：保留横向滚动样式，并兼容 Taro `ScrollView`。
- 修改 `fanda-app/src/pages/profile/index.tsx`：增加积分明细加载状态、错误状态和重试。
- 修改 `fanda-app/src/pages/profile/index.scss`：增加加载与错误态样式。

## Task 1: 依赖版本与 Husky 位置

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `fanda-app/package.json`
- Modify: `fanda-app/package-lock.json`

- [ ] **Step 1: 修改依赖声明**

将根目录 `engines.node` 改为 `>=18.12`，并增加：

```json
"devDependencies": {
  "husky": "^9.1.7"
}
```

将 `fanda-app/package.json` 中：

```json
"lint-staged": "^16.4.0"
```

改为：

```json
"lint-staged": "15.5.2"
```

- [ ] **Step 2: 同步锁文件**

运行：

```bash
npm install --package-lock-only --ignore-scripts
npm --prefix fanda-app install --package-lock-only --ignore-scripts
```

预期：根目录锁文件出现 Husky，前端锁文件中的 `lint-staged` 为 `15.5.2`，且其 engines 为 `>=18.12.0`。

## Task 2: 安装脚本判断

**Files:**
- Modify: `scripts/install-deps.js`
- Modify: `scripts/start.test.js`
- Create: `scripts/install-deps.test.js`

- [ ] **Step 1: 暴露可测试路径与判断函数**

在 `scripts/install-deps.js` 中增加：

```js
const PACKAGE_LOCK_PATH = path.join(ROOT, 'fanda-app', 'package-lock.json')

function isFileNotOlderThan(targetPath, sourcePaths) {
  if (!fs.existsSync(targetPath)) return false
  try {
    const targetStat = fs.statSync(targetPath)
    return sourcePaths.every((sourcePath) => {
      if (!fs.existsSync(sourcePath)) return true
      const sourceStat = fs.statSync(sourcePath)
      return targetStat.mtimeMs >= sourceStat.mtimeMs
    })
  } catch {
    return false
  }
}
```

- [ ] **Step 2: 修改安装步骤**

将源初始化步骤的 `isDone` 改为始终返回 `false`，确保每次快速探测并刷新 `.npmrc`。将前端依赖步骤改为：

```js
isDone: () => isFileNotOlderThan(NODE_MODULES_LOCK, [
  PACKAGE_JSON_PATH,
  PACKAGE_LOCK_PATH,
])
```

- [ ] **Step 3: 更新测试**

在 `scripts/start.test.js` 中仍断言三步存在，但不再假设源初始化会被 `.npmrc` 跳过。

新建 `scripts/install-deps.test.js`，用临时目录覆盖文件时间测试 `isFileNotOlderThan()`：

```js
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { isFileNotOlderThan } = require('./install-deps')

function touch(filePath, time) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, '')
  fs.utimesSync(filePath, time, time)
}

test('detects target older than any source file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanda-install-'))
  const target = path.join(dir, 'node_modules', '.package-lock.json')
  const packageJson = path.join(dir, 'package.json')
  const packageLock = path.join(dir, 'package-lock.json')
  touch(target, new Date('2026-01-01T00:00:00Z'))
  touch(packageJson, new Date('2026-01-01T00:00:00Z'))
  touch(packageLock, new Date('2026-01-02T00:00:00Z'))

  assert.equal(isFileNotOlderThan(target, [packageJson, packageLock]), false)
})

test('accepts target not older than package files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanda-install-'))
  const target = path.join(dir, 'node_modules', '.package-lock.json')
  const packageJson = path.join(dir, 'package.json')
  const packageLock = path.join(dir, 'package-lock.json')
  touch(packageJson, new Date('2026-01-01T00:00:00Z'))
  touch(packageLock, new Date('2026-01-01T00:00:00Z'))
  touch(target, new Date('2026-01-02T00:00:00Z'))

  assert.equal(isFileNotOlderThan(target, [packageJson, packageLock]), true)
})
```

## Task 3: 菜品分类横向滚动

**Files:**
- Modify: `fanda-app/src/pages/dishes/index.tsx`
- Modify: `fanda-app/src/pages/dishes/index.scss`

- [ ] **Step 1: 恢复类型标签 ScrollView**

将菜品类型标签容器改为：

```tsx
<ScrollView className='tab-scroll' scrollX scrollWithAnimation>
  <View className='tab-list'>
    {DISH_TYPES.map(item => (
      <View
        key={item.key}
        className={`tab-item ${activeTab === item.key ? 'active' : ''}`}
        onClick={() => handleTabChange(item.key)}
      >
        <Text className='tab-label'>{item.label}</Text>
      </View>
    ))}
  </View>
</ScrollView>
```

- [ ] **Step 2: 保持样式兼容**

保留 `.tab-scroll` 的宽度与横向滚动样式，不新增视觉变化。

## Task 4: 积分状态区分

**Files:**
- Modify: `fanda-app/src/pages/profile/index.tsx`
- Modify: `fanda-app/src/pages/profile/index.scss`

- [ ] **Step 1: 增加状态类型**

在 `profile/index.tsx` 中增加：

```ts
type PointHistoryStatus = 'idle' | 'loading' | 'success' | 'error'
```

组件状态增加：

```ts
const [pointHistoryStatus, setPointHistoryStatus] = useState<PointHistoryStatus>('idle')
```

- [ ] **Step 2: 修改加载逻辑**

将展开积分逻辑改为：收起时只关闭；展开时如果正在加载则直接返回；请求前设置 `loading`，成功设置 `success`，失败设置 `error` 并清空列表。

- [ ] **Step 3: 修改渲染逻辑**

折叠面板内容按状态渲染：

```tsx
{pointHistoryStatus === 'loading' && (
  <View className='point-state'>
    <Text className='point-state-text'>加载中…</Text>
  </View>
)}
{pointHistoryStatus === 'error' && (
  <View className='point-state error' onClick={togglePointHistory}>
    <Text className='point-state-text'>加载失败，点击重试</Text>
  </View>
)}
{pointHistoryStatus === 'success' && pointHistory.length === 0 && (
  <View className='point-empty'>
    <Text className='point-empty-text'>暂无积分记录</Text>
  </View>
)}
```

- [ ] **Step 4: 增加样式**

添加 `.point-state` 和 `.point-state.error`，复用当前空状态的字号和颜色，错误态使用 `var(--color-danger)`。

## Task 5: 验证

**Files:**
- No code changes.

- [ ] **Step 1: 运行脚本测试**

```bash
npm test
```

预期：根目录 node:test 通过。

- [ ] **Step 2: 运行前端 ESLint**

```bash
npm --prefix fanda-app run lint
```

预期：无 ESLint 错误。

- [ ] **Step 3: 运行三端构建**

```bash
npm --prefix fanda-app run build:h5
npm --prefix fanda-app run build:weapp
npm --prefix fanda-app run build:tt
```

预期：构建通过；若仅出现体积警告，记录但不作为失败。

- [ ] **Step 4: 检查版本约束**

```bash
npm --prefix fanda-app ls lint-staged
npm ls husky
```

预期：`lint-staged@15.5.2` 位于 `fanda-app`，`husky@9.1.7` 位于根项目。

- [ ] **Step 5: 检查 Git 状态**

```bash
git status --short
```

预期：只包含本次修复相关文件，未产生临时文件。

## 自审

- 覆盖了设计文档中的五项问题。
- 未包含 Git 提交步骤。
- 未包含后端或数据库变更。
- 所有路径均为当前仓库实际路径。
