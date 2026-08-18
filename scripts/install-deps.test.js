const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { getInstallSteps, isFileNotOlderThan } = require('./install-deps')

// touch 生成带指定修改时间的临时文件，用于模拟依赖产物与源文件的新旧关系。
function touch(filePath, time) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, '')
  fs.utimesSync(filePath, time, time)
}

// 测试意图：验证依赖安装脚本的跳过判断、轻量安装过滤和 package scripts 约定。
test('detects target older than any source file', () => {
  // dir 是隔离临时目录；target 模拟 node_modules 锁文件，packageJson/packageLock 模拟依赖输入。
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
  // target 时间晚于输入文件时应被判定为可复用，关键断言为 true。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanda-install-'))
  const target = path.join(dir, 'node_modules', '.package-lock.json')
  const packageJson = path.join(dir, 'package.json')
  const packageLock = path.join(dir, 'package-lock.json')
  touch(packageJson, new Date('2026-01-01T00:00:00Z'))
  touch(packageLock, new Date('2026-01-01T00:00:00Z'))
  touch(target, new Date('2026-01-02T00:00:00Z'))

  assert.equal(isFileNotOlderThan(target, [packageJson, packageLock]), true)
})

test('skip-heavy keeps only lightweight dependency setup steps', () => {
  // steps 是开启 skipHeavy 后的执行计划，关键断言是不包含 npm install/go mod download。
  const steps = getInstallSteps({ skipHeavy: true })

  assert.deepEqual(steps.map((step) => step.label), ['初始化前端 npm 源'])
  assert.equal(
    steps.some((step) => step.command === 'npm' && step.args.includes('install')),
    false,
  )
  assert.equal(
    steps.some((step) => step.command === 'go' && step.args.includes('download')),
    false,
  )
})

test('postinstall is lightweight and bootstrap performs full dependency install', () => {
  const packageJson = require('../package.json')

  assert.equal(packageJson.scripts.postinstall, 'node scripts/install-deps.js --skip-heavy')
  assert.equal(packageJson.scripts.bootstrap, 'node scripts/install-deps.js')
})
