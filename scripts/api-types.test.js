const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('api.ts uses concrete request and parameter types', () => {
  const apiSource = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/services/api.ts'), 'utf8')

  assert.doesNotMatch(apiSource, /request<any>/)
  assert.doesNotMatch(apiSource, /Record<string,\s*any>/)
})
