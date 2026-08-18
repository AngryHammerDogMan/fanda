const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const adminSource = fs.readFileSync(
  path.join(process.cwd(), 'fanda-server/static/admin/index.html'),
  'utf8',
)

test('static admin sends dish deletion as a DELETE fetch option', () => {
  assert.match(adminSource, /api\('\/dishes\/' \+ id,\s*undefined,\s*\{\s*method:\s*'DELETE'\s*\}\)/)
  assert.doesNotMatch(adminSource, /api\('\/dishes\/' \+ id,\s*\{\s*method:\s*'DELETE'\s*\}\)/)
})

test('static admin list rows use table_id and never read legacy group_type', () => {
  assert.doesNotMatch(adminSource, /\bgroup_type\b/)
  assert.match(adminSource, /\$\{esc\(d\.table_id\)\|\|'-'\}/)
  assert.match(adminSource, /\$\{esc\(o\.table_id\)\|\|'-'\}/)
  assert.match(adminSource, /\$\{esc\(r\.table_id\)\|\|'-'\}/)
})
