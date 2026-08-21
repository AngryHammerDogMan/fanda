const assert = require('node:assert/strict')
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const srcRoot = join(__dirname, '..')

const readSource = (...segments) => readFileSync(join(srcRoot, ...segments), 'utf8')

const loadTypeScriptModule = (source, dependencies = {}, globals = {}) => {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  const requireModule = (id) => {
    if (id in dependencies) return dependencies[id]
    throw new Error(`Unexpected dependency: ${id}`)
  }
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: requireModule,
    Date,
    ...globals,
  })
  return module.exports
}

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

test('金额纯函数区分空值、零值并校验两位小数', () => {
  const utilityPath = join(srcRoot, 'utils', 'amount.ts')
  assert.equal(existsSync(utilityPath), true, 'amount 工具尚未实现')
  if (!existsSync(utilityPath)) return

  const source = readFileSync(utilityPath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  vm.runInNewContext(compiled, { exports: module.exports, module })
  const {
    getDefaultConfirmedAmount,
    parseAmountInput,
    sumNullableAmounts,
    validateAmountInput,
  } = module.exports

  assert.equal(getDefaultConfirmedAmount(20, 3), '60.00')
  assert.equal(getDefaultConfirmedAmount(null, 3), '')
  assert.equal(parseAmountInput('0'), 0)
  assert.equal(parseAmountInput('12.34'), 12.34)
  assert.equal(validateAmountInput('-1'), '金额不能小于 0')
  assert.equal(validateAmountInput('1.234'), '金额最多保留两位小数')
  assert.equal(validateAmountInput('abc'), '请输入有效金额')
  assert.equal(validateAmountInput('100000000'), '金额不能超过 99999999.99')
  assert.equal(sumNullableAmounts([10.1, null, 2.2]), 12.3)
  assert.equal(sumNullableAmounts([null, null]), null)
  assert.equal(sumNullableAmounts([0, null]), 0)
})

test('H5 mock follows confirmed amount and source-aware calendar semantics', () => {
  const source = readSource('services', 'h5-preview.ts')

  assert.match(source, /confirmed_amount/)
  assert.match(source, /sumNullableAmounts/)
  assert.match(source, /options\.method\s*===\s*'POST'/)
  assert.match(source, /options\.method\s*===\s*'DELETE'/)
  assert.match(source, /h5CalendarRecords/)
  assert.match(source, /options\.method\s*===\s*'PUT'/)
  assert.match(source, /order_items/)
  assert.doesNotMatch(source, /item\.unit_price\s*\|\|\s*0\)\s*\*\s*item\.quantity/)
})

test('日历补记使用统一金额校验与解析', () => {
  const source = readSource('pages', 'calendar', 'record.tsx')

  assert.match(source, /handleCreateRecord[\s\S]*validateAmountInput\(amount\)/)
  assert.match(source, /handleCreateRecord[\s\S]*parseAmountInput\(amount\)/)
  assert.doesNotMatch(source, /amount:\s*amount\s*\?\s*Number\(amount\)\s*:\s*null/)
})

test('订单列表只接受最新请求结果', () => {
  const source = readSource('pages', 'orders', 'index.tsx')

  assert.match(source, /new LatestRequest/)
  assert.match(source, /orderRequestRef\.current\.start\(\)/)
  assert.match(source, /orderRequestRef\.current\.isLatest\(requestId\)/)
})

test('编辑记录再次显示时不会重新加载并覆盖未保存输入', () => {
  const source = readSource('pages', 'calendar', 'record.tsx')

  assert.match(source, /const\s+editFormInitializedRef\s*=\s*useRef\(false\)/)
  assert.match(source, /isEditMode\s*&&\s*editFormInitializedRef\.current/)
  assert.match(source, /editFormInitializedRef\.current\s*=\s*true/)
})

test('订单金额存在非法输入时总额明确显示格式错误而非有效项小计', () => {
  const source = readSource('pages', 'calendar', 'record.tsx')

  assert.match(source, /const\s+hasInvalidEditableAmount\s*=\s*editableItems\.some/)
  assert.match(source, /hasInvalidEditableAmount\s*\?\s*'金额格式有误'/)
})

test('点单确认任一金额非法时总额明确显示格式错误而非有效项小计', () => {
  const source = readSource('pages', 'orders', 'create.tsx')

  assert.match(source, /const\s+hasInvalidConfirmedAmount\s*=\s*selectedDishes\.some/)
  assert.match(source, /hasInvalidConfirmedAmount\s*\?\s*'金额格式有误'/)
})

test('H5 日历列表返回数组、按查询筛选且不改写记录日期', () => {
  const amountModule = loadTypeScriptModule(readSource('utils', 'amount.ts'))
  const previewModule = loadTypeScriptModule(readSource('services', 'h5-preview.ts'), {
    '@/utils/amount': amountModule,
    './h5-preview-mode': { isH5PreviewRequest: () => true },
  })
  const respond = previewModule.createH5PreviewResponse

  const month = respond({
    url: '/calendar/records',
    method: 'GET',
    data: { table_id: 'h5-buddy-table', year: 2026, month: 8 },
  }).data
  assert.equal(Array.isArray(month), true)
  assert.equal(month.length, 1)
  assert.equal(month[0].record_date, '2026-08-21')

  const otherDate = respond({
    url: '/calendar/records/date',
    method: 'GET',
    data: { table_id: 'h5-buddy-table', date: '2026-08-20' },
  }).data
  assert.equal(Array.isArray(otherDate), true)
  assert.equal(otherDate.length, 0)

  const detail = respond({ url: '/calendar/records/h5-record-1', method: 'GET' }).data
  assert.equal(detail.record_date, '2026-08-21')
})

test('H5 初始关联订单与日历记录状态保持一致', () => {
  const amountModule = loadTypeScriptModule(readSource('utils', 'amount.ts'))
  const previewModule = loadTypeScriptModule(readSource('services', 'h5-preview.ts'), {
    '@/utils/amount': amountModule,
    './h5-preview-mode': { isH5PreviewRequest: () => true },
  })
  const respond = previewModule.createH5PreviewResponse

  const order = respond({ url: '/orders/h5-order-1', method: 'GET' }).data
  const record = respond({ url: '/calendar/records/h5-record-1', method: 'GET' }).data

  assert.equal(record.status, order.status)
})

test('H5 下单后持久化订单和关联日历，列表与详情均可查询', () => {
  const amountModule = loadTypeScriptModule(readSource('utils', 'amount.ts'))
  const previewModule = loadTypeScriptModule(readSource('services', 'h5-preview.ts'), {
    '@/utils/amount': amountModule,
    './h5-preview-mode': { isH5PreviewRequest: () => true },
  })
  const respond = previewModule.createH5PreviewResponse
  const created = respond({
    url: '/orders',
    method: 'POST',
    data: {
      table_id: 'h5-personal-table',
      dine_mode: 'solo',
      items: [{ dish_id: 'h5-dish-1', quantity: 1, confirmed_amount: 42.34 }],
    },
  }).data

  const orders = respond({
    url: '/orders',
    method: 'GET',
    data: { table_id: 'h5-personal-table', status: 'confirmed', page: 1, page_size: 10 },
  }).data
  assert.equal(orders.list.some(order => order.id === created.id), true)
  assert.equal(respond({ url: `/orders/${created.id}`, method: 'GET' }).data.id, created.id)

  const calendar = respond({
    url: '/calendar/records/date',
    method: 'GET',
    data: { table_id: 'h5-personal-table', date: created.created_at.slice(0, 10) },
  }).data
  const linkedRecord = calendar.find(record => record.id === created.calendar_record_id)
  assert.equal(linkedRecord.order.id, created.id)
  assert.equal(linkedRecord.amount, 42.34)
})

test('H5 日历修改订单项后同步订单明细与总额', () => {
  const amountModule = loadTypeScriptModule(readSource('utils', 'amount.ts'))
  const previewModule = loadTypeScriptModule(readSource('services', 'h5-preview.ts'), {
    '@/utils/amount': amountModule,
    './h5-preview-mode': { isH5PreviewRequest: () => true },
  })
  const respond = previewModule.createH5PreviewResponse

  respond({
    url: '/calendar/records/h5-record-1',
    method: 'PUT',
    data: {
      order_items: [{ id: 'h5-order-item-1', confirmed_amount: 99.5 }],
    },
  })

  const order = respond({ url: '/orders/h5-order-1', method: 'GET' }).data
  assert.equal(order.order_items[0].confirmed_amount, 99.5)
  assert.equal(order.total_amount, 99.5)
})

test('H5 confirm/reject/cancel 会持久化订单、参与人和关联日历状态', () => {
  const scenarios = [
    { action: 'confirm', orderStatus: 'confirmed', participantStatus: 'accepted', recordStatus: 'confirmed' },
    { action: 'reject', orderStatus: 'rejected', participantStatus: 'rejected', recordStatus: 'cancelled' },
    { action: 'cancel', orderStatus: 'cancelled', participantStatus: 'skipped', recordStatus: 'cancelled' },
  ]

  for (const scenario of scenarios) {
    const amountModule = loadTypeScriptModule(readSource('utils', 'amount.ts'))
    const previewModule = loadTypeScriptModule(readSource('services', 'h5-preview.ts'), {
      '@/utils/amount': amountModule,
      './h5-preview-mode': { isH5PreviewRequest: () => true },
    })
    const respond = previewModule.createH5PreviewResponse

    respond({ url: `/orders/h5-order-1/${scenario.action}`, method: 'POST' })

    const order = respond({ url: '/orders/h5-order-1', method: 'GET' }).data
    const record = respond({ url: '/calendar/records/h5-record-1', method: 'GET' }).data
    assert.equal(order.status, scenario.orderStatus)
    assert.equal(order.participants[0].status, scenario.participantStatus)
    assert.equal(record.status, scenario.recordStatus)
  }
})

test('H5 vote 会持久化投票并允许同一用户改票', () => {
  const amountModule = loadTypeScriptModule(readSource('utils', 'amount.ts'))
  const previewModule = loadTypeScriptModule(readSource('services', 'h5-preview.ts'), {
    '@/utils/amount': amountModule,
    './h5-preview-mode': { isH5PreviewRequest: () => true },
  })
  const respond = previewModule.createH5PreviewResponse

  respond({ url: '/orders/h5-order-1/vote', method: 'POST', data: { vote: 'approve' } })
  const approved = respond({ url: '/orders/h5-order-1/votes', method: 'GET' }).data
  assert.equal(approved.approve, 1)
  assert.equal(approved.reject, 0)
  assert.equal(approved.total, 1)

  respond({ url: '/orders/h5-order-1/vote', method: 'POST', data: { vote: 'reject' } })
  const rejected = respond({ url: '/orders/h5-order-1/votes', method: 'GET' }).data
  assert.equal(rejected.approve, 0)
  assert.equal(rejected.reject, 1)
  assert.equal(rejected.total, 1)
})

test('H5 下单关联日历使用本地日期而非 UTC 日期', () => {
  const utcTime = '2026-08-20T16:30:00.000Z'
  class CrossDayDate extends Date {
    constructor(...args) {
      super(args.length > 0 ? args[0] : utcTime)
    }

    static now() {
      return Date.parse(utcTime)
    }

    getFullYear() {
      return 2026
    }

    getMonth() {
      return 7
    }

    getDate() {
      return 21
    }
  }

  const amountModule = loadTypeScriptModule(readSource('utils', 'amount.ts'))
  const previewModule = loadTypeScriptModule(readSource('services', 'h5-preview.ts'), {
    '@/utils/amount': amountModule,
    './h5-preview-mode': { isH5PreviewRequest: () => true },
  }, { Date: CrossDayDate })
  const respond = previewModule.createH5PreviewResponse
  const created = respond({
    url: '/orders',
    method: 'POST',
    data: {
      table_id: 'h5-personal-table',
      dine_mode: 'solo',
      items: [{ dish_id: 'h5-dish-1', quantity: 1, confirmed_amount: 42.34 }],
    },
  }).data

  const records = respond({
    url: '/calendar/records/date',
    method: 'GET',
    data: { table_id: 'h5-personal-table', date: '2026-08-21' },
  }).data
  const linkedRecord = records.find(record => record.id === created.calendar_record_id)
  assert.equal(created.created_at.slice(0, 10), '2026-08-20')
  assert.equal(linkedRecord.record_date, '2026-08-21')
})

test('去下单不因非法金额阻止打开唯一的结算编辑弹层', () => {
  const source = readSource('pages', 'orders', 'create.tsx')
  const checkoutHandler = source.match(
    /const handleCheckoutClick = \(\) => \{([\s\S]*?)\n  const handleClearCart/
  )?.[1] || ''
  const submitHandler = source.match(
    /const submitOrder = async \(\) => \{([\s\S]*?)\n  const toggleParticipant/
  )?.[1] || ''

  assert.doesNotMatch(checkoutHandler, /validateAmountInput/)
  assert.match(checkoutHandler, /setShowCheckoutSheet\(true\)/)
  assert.match(submitHandler, /validateAmountInput\(item\.confirmedAmount\)/)
})

test('餐桌前置请求与订单请求共享世代，旧闭包不能启动或覆盖当前 Tab 请求', () => {
  const source = readSource('pages', 'orders', 'index.tsx')
  const loader = source.match(
    /const loadTablesAndOrders = async \(\) => \{([\s\S]*?)\n  const switchTab/
  )?.[1] || ''

  assert.match(
    loader,
    /const requestId = orderRequestRef\.current\.start\(\)[\s\S]*await tableAPI\.list\(\)/
  )
  assert.match(
    loader,
    /await tableAPI\.list\(\)[\s\S]*if \(!orderRequestRef\.current\.isLatest\(requestId\)\) return[\s\S]*setTables\(list\)/
  )
})
