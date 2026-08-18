const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const adminSource = fs.readFileSync(
  path.join(process.cwd(), 'fanda-server/static/admin/index.html'),
  'utf8',
)

// 测试意图：通过静态扫描后台页面，锁定删除请求参数位置和餐桌字段展示约定。
test('static admin sends dish deletion as a DELETE fetch option', () => {
  // 关键断言：DELETE method 必须作为第三个 fetch option 传入，避免被误当成请求体。
  assert.match(adminSource, /api\('\/dishes\/' \+ id,\s*undefined,\s*\{\s*method:\s*'DELETE'\s*\}\)/)
  assert.doesNotMatch(adminSource, /api\('\/dishes\/' \+ id,\s*\{\s*method:\s*'DELETE'\s*\}\)/)
})

test('static admin list rows use table_id and never read legacy group_type', () => {
  // adminSource 是后台 HTML 源码快照；这里确保列表读取 table_id 而非旧 group_type。
  assert.doesNotMatch(adminSource, /\bgroup_type\b/)
  assert.match(adminSource, /\$\{esc\(d\.table_id\)\|\|'-'\}/)
  assert.match(adminSource, /\$\{esc\(o\.table_id\)\|\|'-'\}/)
  assert.match(adminSource, /\$\{esc\(r\.table_id\)\|\|'-'\}/)
})
