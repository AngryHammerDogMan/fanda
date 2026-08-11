const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const extractInterface = (source, name) => {
  const match = source.match(new RegExp(`export interface ${name} [\\s\\S]*?\\n}`))
  assert.ok(match, `${name} interface must exist`)
  return match[0]
}

test('api.ts uses concrete request and parameter types', () => {
  const apiSource = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/services/api.ts'), 'utf8')
  const typesSource = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/types/index.ts'), 'utf8')

  assert.doesNotMatch(apiSource, /request<any>/)
  assert.doesNotMatch(apiSource, /Record<string,\s*any>/)
  assert.doesNotMatch(apiSource, /Record<[^>]*any>/)
  assert.doesNotMatch(typesSource, /Record<[^>]*any>/)
  assert.match(apiSource, /export const tableAPI = \{/)
  assert.match(typesSource, /export interface Table\s*\{/)
  assert.match(typesSource, /export interface TableMember\s*\{/)
  assert.match(typesSource, /export interface OrderParticipant\s*\{/)
  assert.match(typesSource, /table_id: string/)
  assert.doesNotMatch(extractInterface(typesSource, 'DishListParams'), /group_type|group_id/)
  assert.doesNotMatch(extractInterface(typesSource, 'CreateOrderPayload'), /group_type|group_id/)
})
