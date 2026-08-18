const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

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

test('菜品表单使用 DishPayload dish_type 类型并双重阻止重复提交', () => {
  const source = readSource('pages', 'dishes', 'create.tsx')

  assert.match(source, /useState<DishPayload\['dish_type'\]>\('dish'\)/)
  assert.match(source, /const\s+handleSubmit\s*=\s*async\s*\(\)\s*=>\s*\{\s*if\s*\(submitting\)\s*return/)
  assert.match(source, /onClick=\{submitting\s*\?\s*undefined\s*:\s*handleSubmit\}/)
})

test('latest-request-wins 控制器拒绝晚完成的旧请求', async () => {
  const utilityPath = join(srcRoot, 'utils', 'latest-request.ts')
  assert.equal(existsSync(utilityPath), true, 'latest-request 工具尚未实现')
  if (!existsSync(utilityPath)) return

  const source = readFileSync(utilityPath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { exports: module.exports, module })
  const { LatestRequest } = module.exports
  const controller = new LatestRequest()
  const oldRequest = controller.start()
  const newRequest = controller.start()

  await Promise.resolve()
  assert.equal(controller.isLatest(oldRequest), false)
  assert.equal(controller.isLatest(newRequest), true)
})

test('菜品、广场和日历请求仅允许最新请求更新状态', () => {
  const dishesSource = readSource('pages', 'dishes', 'index.tsx')
  const plazaSource = readSource('pages', 'plaza', 'index.tsx')
  const calendarSource = readSource('pages', 'calendar', 'index.tsx')

  assert.match(dishesSource, /dishRequestRef\.current\.start\(\)/)
  assert.match(dishesSource, /dishRequestRef\.current\.isLatest\(requestId\)/)
  assert.match(plazaSource, /plazaRequestRef\.current\.start\(\)/)
  assert.match(plazaSource, /plazaRequestRef\.current\.isLatest\(requestId\)/)
  assert.match(calendarSource, /monthRequestRef\.current\.start\(\)/)
  assert.match(calendarSource, /monthRequestRef\.current\.isLatest\(requestId\)/)
  assert.match(calendarSource, /dateRequestRef\.current\.start\(\)/)
  assert.match(calendarSource, /dateRequestRef\.current\.isLatest\(requestId\)/)
})
