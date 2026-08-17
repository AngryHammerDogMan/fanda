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
    ['/api/v1/auth/login', 'post'],
    ['/api/v1/auth/profile', 'get'],
    ['/api/v1/tables', 'get'],
    ['/api/v1/dishes', 'get'],
    ['/api/v1/plaza', 'get'],
    ['/api/v1/orders', 'post'],
    ['/api/v1/budget', 'get'],
    ['/api/v1/basket', 'post'],
    ['/api/v1/wishes', 'post'],
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

test('generated TypeScript API types avoid any and expose reusable operations', () => {
  assert.ok(fs.existsSync(generatedApiPath), 'fanda-app/src/types/generated-api.ts must be generated')

  const generatedSource = fs.readFileSync(generatedApiPath, 'utf8')
  assert.doesNotMatch(generatedSource, /\bany\b/, 'generated API types must not contain any')
  assert.match(generatedSource, /export type components = \{/)
  assert.match(generatedSource, /export type operations = \{/)
  assert.match(generatedSource, /authLogin: \{/)
  assert.match(generatedSource, /createOrder: \{/)
})

test('front-end API types are derived from generated API schemas', () => {
  const apiTypesSource = fs.readFileSync(apiTypesPath, 'utf8')

  assert.match(apiTypesSource, /import type \{ components, operations \} from '\.\/generated-api'/)
  assert.match(apiTypesSource, /export type User = components\['schemas'\]\['User'\]/)
  assert.match(apiTypesSource, /export type CreateOrderPayload = operations\['createOrder'\]\['requestBody'\]/)
  assert.match(apiTypesSource, /export type DishListParams = operations\['listDishes'\]\['parameters'\]\['query'\]/)
  assert.doesNotMatch(apiTypesSource, /export interface (User|Dish|Order|Table|BudgetSetting|BasketItem|WishItem)\b/)
})
