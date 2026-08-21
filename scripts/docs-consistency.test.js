const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

// 测试意图：静态校验 README 与开发文档中的安装、迁移和架构说明保持一致。
test('installation docs distinguish lightweight npm install from full bootstrap', () => {
  // readme/setup 是两份面向开发者的文档，关键断言是都说明 bootstrap 与轻量 postinstall 差异。
  const readme = read('README.md')
  const setup = read('docs/development-setup.md')

  for (const content of [readme, setup]) {
    assert.match(content, /npm run bootstrap/)
    assert.match(content, /跳过前端依赖安装和后端 Go 依赖下载/)
  }
})

test('migration docs describe version tracking, env config, Windows support, and legacy baseline', () => {
  // content 临时代表每份文档正文，循环断言迁移说明都包含版本表、环境配置和基线参数。
  const readme = read('README.md')
  const setup = read('docs/development-setup.md')

  for (const content of [readme, setup]) {
    assert.match(content, /schema_migrations/)
    assert.match(content, /fanda-server\/\.env/)
    assert.match(content, /-baseline 004/)
    assert.doesNotMatch(content, /Windows 不使用 `npm run db:migrate`/)
  }
})

test('architecture docs point to the shared H5 preview mode module', () => {
  // architecture 是架构文档源码，断言它指向共享预览模式模块和编译期开关。
  const architecture = read('docs/architecture.md')

  assert.match(architecture, /h5-preview-mode\.ts/)
  assert.match(architecture, /H5_PREVIEW_MOCK_ENABLED/)
})

test('README and architecture docs describe confirmed amount flow and migration 006', () => {
  const readme = read('README.md')
  const architecture = read('docs/architecture.md')

  for (const content of [readme, architecture]) {
    assert.match(content, /参考金额/)
    assert.match(content, /本次确认金额/)
    assert.match(content, /订单项确认金额汇总/)
    assert.match(content, /订单来源日历不能直接修改总金额/)
    assert.match(content, /006_order_item_confirmed_amount\.sql/)
  }
})
