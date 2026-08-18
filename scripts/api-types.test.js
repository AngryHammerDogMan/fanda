const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

// 测试意图：防止前端 API 层退回 any/map，并确保业务 API 与请求、鉴权、H5 mock 职责拆分。
test('api.ts uses concrete request and parameter types', () => {
  // apiContent/typesSource 分别代表服务实现与类型导出，关键断言是无 any 且导出表相关类型。
  const apiContent = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/services/api.ts'), 'utf8')
  const typesSource = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/types/index.ts'), 'utf8')

  assert(!apiContent.includes('request<any>'), 'api.ts must not use request<any>')
  assert(!apiContent.includes('Record<string, any>'), 'api.ts must not use Record<string, any>')
  assert.doesNotMatch(apiContent, /Record<[^>]*any>/)
  assert.doesNotMatch(typesSource, /Record<[^>]*any>/)
  assert(apiContent.includes('tableAPI'), 'api.ts must export tableAPI')
  assert.match(apiContent, /export const tableAPI = \{/)
  assert.match(typesSource, /export type TableMember = components\['schemas'\]\['TableMember'\]/)
  assert.match(typesSource, /export type OrderParticipant = components\['schemas'\]\['OrderParticipant'\]/)
  assert.match(typesSource, /export type OrderBasketItemPayload = components\['schemas'\]\['OrderBasketItemPayload'\]/)
  assert.match(typesSource, /export type CreateOrderPayload = operations\['createOrder'\]\['requestBody'\]/)
  assert.match(typesSource, /export type DishListParams = operations\['listDishes'\]\['parameters'\]\['query'\]/)
  assert.match(typesSource, /export type BasketPayload = operations\['addToBasket'\]\['requestBody'\]/)
  assert.doesNotMatch(typesSource, /group_type|group_id|order_items:/)
})

test('api service splits business API from request, auth session, and H5 preview mock', () => {
  // servicesDir 是服务层目录，以下源码片段用于断言依赖方向和模块边界。
  const servicesDir = path.join(process.cwd(), 'fanda-app/src/services')
  const apiContent = fs.readFileSync(path.join(servicesDir, 'api.ts'), 'utf8')
  const requestContent = fs.readFileSync(path.join(servicesDir, 'request.ts'), 'utf8')
  const authSessionContent = fs.readFileSync(path.join(servicesDir, 'auth-session.ts'), 'utf8')
  const h5PreviewContent = fs.readFileSync(path.join(servicesDir, 'h5-preview.ts'), 'utf8')

  assert.match(apiContent, /import \{ request \} from ['"]\.\/request['"]/)
  assert.doesNotMatch(apiContent, /Taro\.request|Taro\.getStorageSync|h5-preview-token|createH5PreviewResponse/)
  assert.match(requestContent, /redirectToLoginOnce/)
  assert.match(requestContent, /resetAuthRedirect/)
  assert.match(requestContent, /createH5PreviewResponse/)
  assert.match(authSessionContent, /export const resetAuthRedirect/)
  assert.match(authSessionContent, /isRedirectingToLogin = false/)
  assert.match(h5PreviewContent, /export const isH5PreviewRequest/)
})
