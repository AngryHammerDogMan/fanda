const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const srcRoot = join(__dirname, '..')

const readSource = (...segments) => readFileSync(join(srcRoot, ...segments), 'utf8')

test('菜品页分类切换不再依赖 setTimeout，并显式传入新分类参数', () => {
  const source = readSource('pages', 'dishes', 'index.tsx')

  assert.equal(source.includes('setTimeout'), false)
  assert.match(
    source,
    /const\s+loadDishes\s*=\s*useCallback\s*\(\s*async\s*\(\s*pageNum:\s*number,\s*append:\s*boolean,\s*options\?:\s*\{\s*tableId\?:\s*string;\s*dishType\?:\s*string;\s*keyword\?:\s*string\s*\}/
  )
  assert.match(source, /const\s+dishType\s*=\s*options\?\.dishType\s*\?\?\s*activeTab/)
  assert.match(source, /const\s+nextKeyword\s*=\s*options\?\.keyword\s*\?\?\s*searchKeyword/)
  assert.match(source, /loadDishes\(1,\s*false,\s*\{\s*dishType:\s*key\s*\}\)/)
})

test('广场页分类切换不再依赖 setTimeout，并显式传入新分类参数', () => {
  const source = readSource('pages', 'plaza', 'index.tsx')

  assert.equal(source.includes('setTimeout'), false)
  assert.match(
    source,
    /const\s+loadDishes\s*=\s*async\s*\(\s*reset\s*=\s*false,\s*options\?:\s*\{\s*category\?:\s*string;\s*keyword\?:\s*string\s*\}/
  )
  assert.match(source, /const\s+nextCategory\s*=\s*options\?\.category\s*\?\?\s*activeCategory/)
  assert.match(source, /const\s+nextKeyword\s*=\s*options\?\.keyword\s*\?\?\s*keyword/)
  assert.match(source, /loadDishes\(true,\s*\{\s*category:\s*cat\s*\}\)/)
})

test('PlazaCategoriesResponse 收敛为 string[] 且页面不再读取旧兼容 categories 字段', () => {
  const typesSource = readSource('types', 'index.ts')
  const plazaSource = readSource('pages', 'plaza', 'index.tsx')

  assert.match(typesSource, /export\s+type\s+PlazaCategoriesResponse\s*=\s*string\[\]/)
  assert.doesNotMatch(typesSource, /PlazaCategoriesResponse\s*=\s*string\[\]\s*&/)
  assert.doesNotMatch(typesSource, /categories\?:\s*string\[\]/)
  assert.doesNotMatch(plazaSource, /res\.data\?\.categories/)
})
