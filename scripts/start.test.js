const assert = require('node:assert/strict')
const fs = require('node:fs')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const { getInstallSteps } = require('./install-deps')
const { getMenuItems, resolveTask } = require('./start')

test('install steps cover frontend npm dependencies and backend Go modules', () => {
  const steps = getInstallSteps()

  assert.deepEqual(
    steps.map((step) => step.label),
    ['初始化前端 npm 源', '安装前端依赖', '下载后端 Go 依赖']
  )
  assert.deepEqual(steps[0].command, 'node')
  assert.deepEqual(steps[0].args, ['scripts/setup-npm-registry.js'])
  assert.deepEqual(steps[1].command, 'npm')
  assert.deepEqual(steps[1].args, ['--prefix', 'fanda-app', 'install'])
  assert.deepEqual(steps[2].command, 'go')
  assert.deepEqual(steps[2].args, ['-C', 'fanda-server', 'mod', 'download'])
})

test('start menu exposes the common local development tasks', () => {
  const taskKeys = getMenuItems().map((item) => item.key)

  assert.deepEqual(taskKeys, ['registry', 'h5', 'server', 'postgres', 'redis', 'migrate'])
})

test('resolveTask accepts menu numbers and task keys', () => {
  assert.equal(resolveTask('1').key, 'registry')
  assert.equal(resolveTask('h5').key, 'h5')
  assert.equal(resolveTask('server').key, 'server')
  assert.equal(resolveTask('postgres').key, 'postgres')
  assert.equal(resolveTask('unknown'), undefined)
})

test('invalid explicit task exits without opening the interactive menu', () => {
  const result = spawnSync(process.execPath, ['scripts/start.js', '--task', 'unknown'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 1000,
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /未识别的选项/)
  assert.doesNotMatch(result.stdout, /请选择要启动的服务/)
})

test('migrate task uses the versioned Go runner without hard-coded database credentials', () => {
  const source = fs.readFileSync('scripts/start.js', 'utf8')
  const task = resolveTask('migrate')

  assert.equal(task.command, 'go')
  assert.deepEqual(task.args, ['-C', 'fanda-server', 'run', 'cmd/migrate/main.go'])
  assert.doesNotMatch(source, /-U postgres/)
  assert.doesNotMatch(source, /-d fanda/)
})
