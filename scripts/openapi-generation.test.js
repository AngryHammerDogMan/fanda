const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const rootDir = process.cwd()
const openapiPath = path.join(rootDir, 'docs/openapi.json')
const generatedApiPath = path.join(rootDir, 'fanda-app/src/types/generated-api.ts')
const apiTypesPath = path.join(rootDir, 'fanda-app/src/types/index.ts')

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))

test('generated openapi spec includes common app paths and schemas', () => {
  assert.ok(fs.existsSync(openapiPath), 'docs/openapi.json must be generated')

  const spec = readJson(openapiPath)
  assert.equal(spec.openapi, '3.0.3')

  for (const [route, method] of [
    ['/auth/login', 'post'],
    ['/auth/profile', 'get'],
    ['/tables', 'get'],
    ['/dishes', 'get'],
    ['/plaza', 'get'],
    ['/orders', 'post'],
    ['/budget', 'get'],
    ['/basket', 'post'],
    ['/wishes', 'post'],
  ]) {
    assert.ok(spec.paths?.[route]?.[method], `${method.toUpperCase()} ${route} must be documented`)
  }

  for (const schemaName of [
    'LoginResult',
    'User',
    'Table',
    'Dish',
    'PlazaDish',
    'Order',
    'BudgetSetting',
    'BasketItem',
    'WishItem',
    'CreateOrderPayload',
  ]) {
    assert.ok(spec.components?.schemas?.[schemaName], `${schemaName} schema must exist`)
  }
})

test('openapi base path is declared once and OpenAPI 3.0 schemas avoid type null', () => {
  const spec = readJson(openapiPath)

  assert.deepEqual(spec.servers, [{ url: '/api/v1' }])
  assert.equal(
    Object.keys(spec.paths).some((route) => route.startsWith('/api/v1/')),
    false,
    'paths must be relative to the /api/v1 server URL',
  )

  const illegalNullSchemas = []
  const untypedNullableSchemas = []
  const visit = (value, location = '$') => {
    if (!value || typeof value !== 'object') return
    if (value.type === 'null') illegalNullSchemas.push(location)
    if (value.nullable === true && !value.type && !value.$ref) untypedNullableSchemas.push(location)
    for (const [key, child] of Object.entries(value)) {
      visit(child, `${location}.${key}`)
    }
  }
  visit(spec)
  assert.deepEqual(illegalNullSchemas, [], 'OpenAPI 3.0.3 must express null with nullable, not type: null')
  assert.deepEqual(untypedNullableSchemas, [], 'nullable schemas must declare a concrete type or reference')
})

test('calendar list operations return arrays and require a date-formatted date query', () => {
  const spec = readJson(openapiPath)
  const monthlyData = spec.paths['/calendar/records'].get.responses[200]
    .content['application/json'].schema.properties.data
  const dailyOperation = spec.paths['/calendar/records/date'].get
  const dailyData = dailyOperation.responses[200]
    .content['application/json'].schema.properties.data
  const dateParameter = dailyOperation.parameters.find((parameter) => parameter.name === 'date')

  assert.equal(monthlyData.type, 'array')
  assert.equal(monthlyData.items.$ref, '#/components/schemas/CalendarRecord')
  assert.equal(dailyData.type, 'array')
  assert.equal(dailyData.items.$ref, '#/components/schemas/CalendarRecord')
  assert.equal(dateParameter.required, true)
  assert.deepEqual(dateParameter.schema, { type: 'string', format: 'date' })
})

test('generated TypeScript API types avoid any and expose reusable operations', () => {
  assert.ok(fs.existsSync(generatedApiPath), 'fanda-app/src/types/generated-api.ts must be generated')

  const generatedSource = fs.readFileSync(generatedApiPath, 'utf8')
  assert.doesNotMatch(generatedSource, /\bany\b/, 'generated API types must not contain any')
  assert.match(generatedSource, /export type components = \{/)
  assert.match(generatedSource, /export type operations = \{/)
  assert.match(generatedSource, /authLogin: \{/)
  assert.match(generatedSource, /createOrder: \{/)
  assert.match(
    generatedSource,
    /listCalendarRecords:[\s\S]*?response: ApiResponse<components\['schemas'\]\['CalendarRecord'\]\[\]>/,
  )
  assert.match(
    generatedSource,
    /listCalendarRecordsByDate:[\s\S]*?date: string[\s\S]*?response: ApiResponse<components\['schemas'\]\['CalendarRecord'\]\[\]>/,
  )
})

test('front-end API types are derived from generated API schemas', () => {
  const apiTypesSource = fs.readFileSync(apiTypesPath, 'utf8')

  assert.match(apiTypesSource, /import type \{ components, operations \} from '\.\/generated-api'/)
  assert.match(apiTypesSource, /export type User = components\['schemas'\]\['User'\]/)
  assert.match(apiTypesSource, /export type CreateOrderPayload = operations\['createOrder'\]\['requestBody'\]/)
  assert.match(apiTypesSource, /export type DishListParams = operations\['listDishes'\]\['parameters'\]\['query'\]/)
  assert.doesNotMatch(apiTypesSource, /export interface (User|Dish|Order|Table|BudgetSetting|BasketItem|WishItem)\b/)
})
