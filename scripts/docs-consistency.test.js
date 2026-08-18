const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const root = path.resolve(__dirname, '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('installation docs distinguish lightweight npm install from full bootstrap', () => {
  const readme = read('README.md')
  const setup = read('docs/development-setup.md')

  for (const content of [readme, setup]) {
    assert.match(content, /npm run bootstrap/)
    assert.match(content, /跳过前端依赖安装和后端 Go 依赖下载/)
  }
})

test('migration docs describe version tracking, env config, Windows support, and legacy baseline', () => {
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
  const architecture = read('docs/architecture.md')

  assert.match(architecture, /h5-preview-mode\.ts/)
  assert.match(architecture, /H5_PREVIEW_MOCK_ENABLED/)
})
