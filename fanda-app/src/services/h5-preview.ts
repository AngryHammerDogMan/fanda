import type { ApiResponse, components, PaginatedData } from '@/types/generated-api'
import type Taro from '@tarojs/taro'
import { isH5PreviewRequest as isPreviewRequest } from './h5-preview-mode'

export const isH5PreviewRequest = (token: string): boolean => isPreviewRequest(token)

type BasketItem = components['schemas']['BasketItem']
type CreateOrderPayload = components['schemas']['CreateOrderPayload']
type Dish = components['schemas']['Dish']
type Order = components['schemas']['Order']
type Table = components['schemas']['Table']
type User = components['schemas']['User']

// H5 预览用户：覆盖账号绑定、伴侣、饭搭成员等核心关系字段，保证主要页面可直接演示。
const h5User: User = {
  uid: 'h5-preview-user',
  nickname: '饭搭预览用户',
  avatar: '',
  points: 1280,
  has_wx: true,
  has_dy: true,
  phone: '138****8000',
  has_phone: true,
  couple: { id: 'h5-couple', user1_id: 'h5-preview-user', user2_id: 'h5-partner', status: 'active' },
  buddy_groups: [{ id: 'h5-buddy', name: '周末饭搭局', owner_id: 'h5-preview-user', max_member: 6, status: 'active', created_at: '2026-08-10T09:00:00Z' }],
  created_at: '2026-08-10T09:00:00Z',
}

const h5Tables: Table[] = [
  {
    id: 'h5-personal-table',
    type: 'personal',
    name: '我的餐桌',
    owner_id: 'h5-preview-user',
    status: 'active',
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
    members: [
      { id: 'h5-personal-member', table_id: 'h5-personal-table', user_id: 'h5-preview-user', role: 'owner', status: 'active', joined_at: '2026-08-10T09:00:00Z' },
    ],
  },
  {
    id: 'h5-buddy-table',
    type: 'buddy',
    name: '周末饭搭局',
    owner_id: 'h5-preview-user',
    status: 'active',
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
    members: [
      { id: 'h5-buddy-member-1', table_id: 'h5-buddy-table', user_id: 'h5-preview-user', role: 'owner', status: 'active', joined_at: '2026-08-10T09:00:00Z' },
      { id: 'h5-buddy-member-2', table_id: 'h5-buddy-table', user_id: 'h5-partner', role: 'member', status: 'active', joined_at: '2026-08-10T09:00:00Z' },
    ],
  },
]

const h5Dishes: Dish[] = [
  {
    id: 'h5-dish-1',
    owner_id: 'h5-preview-user',
    table_id: 'h5-personal-table',
    dish_type: 'dish',
    name: '番茄牛腩煲',
    category: '家常菜',
    difficulty: 2,
    duration: 45,
    price: 42,
    ingredients: [{ name: '牛腩', amount: '500g' }, { name: '番茄', amount: '3 个' }],
    steps: [{ order: 1, description: '牛腩焯水后和番茄慢炖。' }],
    photos: null,
    tags: ['暖胃', '晚餐'],
    restaurant: '',
    restaurant_note: '',
    source: 'manual',
    is_deleted: false,
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
  },
  {
    id: 'h5-dish-2',
    owner_id: 'h5-preview-user',
    table_id: 'h5-personal-table',
    dish_type: 'dish',
    name: '麻婆豆腐',
    category: '川菜',
    difficulty: 1,
    duration: 20,
    price: 18,
    ingredients: [{ name: '嫩豆腐', amount: '1 盒' }, { name: '猪肉末', amount: '100g' }],
    steps: [{ order: 1, description: '豆腐焯水，肉末炒香加豆瓣酱，与豆腐同烧。' }],
    photos: null,
    tags: ['下饭', '快手菜'],
    restaurant: '',
    restaurant_note: '',
    source: 'manual',
    is_deleted: false,
    created_at: '2026-08-09T09:00:00Z',
    updated_at: '2026-08-09T09:00:00Z',
  },
  {
    id: 'h5-dish-3',
    owner_id: 'h5-preview-user',
    table_id: 'h5-buddy-table',
    dish_type: 'takeout',
    name: '牛油果鸡胸沙拉',
    category: '轻食',
    difficulty: null,
    duration: 28,
    price: 36,
    ingredients: null,
    steps: null,
    photos: null,
    tags: ['外卖', '预算内'],
    restaurant: '轻食研究所',
    restaurant_note: '适合工作日晚餐',
    source: 'manual',
    is_deleted: false,
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
  },
  {
    id: 'h5-dish-4',
    owner_id: 'h5-preview-user',
    table_id: 'h5-buddy-table',
    dish_type: 'dineout',
    name: '烧鸟拼盘',
    category: '日料',
    difficulty: null,
    duration: 60,
    price: 128,
    ingredients: null,
    steps: null,
    photos: null,
    tags: ['外食', '约会'],
    restaurant: '烧鸟小馆',
    restaurant_note: '氛围好，适合情侣约会',
    source: 'manual',
    is_deleted: false,
    created_at: '2026-08-10T09:00:00Z',
    updated_at: '2026-08-10T09:00:00Z',
  },
]

let h5PreviewBasketItems: BasketItem[] = [
  {
    id: 'h5-basket-1',
    user_id: 'h5-preview-user',
    table_id: 'h5-personal-table',
    name: '番茄',
    quantity: '3 个',
    is_purchased: false,
    created_at: '2026-08-10T09:00:00Z',
  },
]

const ok = <T>(data: T): ApiResponse<T> => ({ code: 0, message: 'ok', data })

const list = <T>(items: T[]): PaginatedData<T> => ({ list: items, total: items.length, page: 1, page_size: 20 })

const createPreviewOrder = (payload: CreateOrderPayload): Order => {
  const createdAt = new Date().toISOString()
  const orderId = `h5-order-${Date.now()}`
  const createdBasketItems = (payload.basket_items || []).map((item, index): BasketItem => ({
    id: `h5-basket-created-${Date.now()}-${index}`,
    user_id: 'h5-preview-user',
    table_id: payload.table_id,
    name: item.name,
    quantity: item.quantity || '1',
    is_purchased: false,
    created_at: createdAt,
  }))

  h5PreviewBasketItems = [...createdBasketItems, ...h5PreviewBasketItems]

  return {
    id: orderId,
    creator_id: 'h5-preview-user',
    table_id: payload.table_id,
    dine_mode: payload.dine_mode,
    status: payload.dine_mode === 'together' ? 'pending' : 'confirmed',
    total_amount: payload.items.reduce((sum, item) => sum + ((item.unit_price || 0) * item.quantity), 0),
    calendar_record_id: `h5-record-${Date.now()}`,
    order_items: payload.items.map((item, index) => ({
      id: `h5-order-item-${index}`,
      order_id: orderId,
      dish_id: item.dish_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
    })),
    participants: [],
    created_at: createdAt,
  }
}

// H5 mock 响应路由：按真实接口 path 返回轻量数据，避免浏览器预览依赖小程序登录和后端服务。
export const createH5PreviewResponse = <T>(options: Taro.request.Option): ApiResponse<T> => {
  const url = options.url || ''
  const today = new Date().toISOString().slice(0, 10)

  if (url === '/auth/profile') return ok(h5User) as ApiResponse<T>
  if (url === '/tables') return ok(h5Tables) as ApiResponse<T>
  if (url === '/checkin/status') return ok({ today_checked: false, month_count: 18, streak: 7 }) as ApiResponse<T>
  if (url === '/checkin') return ok({ points: 2, checkin_date: today }) as ApiResponse<T>

  if (url === '/dishes') return ok(list(h5Dishes)) as ApiResponse<T>
  if (url.startsWith('/dishes/')) return ok(h5Dishes[0]) as ApiResponse<T>
  if (url === '/plaza') return ok(list(h5Dishes.map((dish) => ({ ...dish, import_count: 128 })))) as ApiResponse<T>
  if (url === '/plaza/categories') return ok(['家常菜', '轻食', '快手菜', '外食灵感']) as ApiResponse<T>

  if (url === '/orders') {
    if (options.method === 'POST') {
      return ok(createPreviewOrder(options.data as CreateOrderPayload)) as ApiResponse<T>
    }
    return ok(list([
      {
        id: 'h5-order-1',
        creator_id: 'h5-preview-user',
        table_id: 'h5-buddy-table',
        dine_mode: 'together',
        status: 'pending',
        total_amount: 58,
        order_items: [{ id: 'h5-order-item-1', order_id: 'h5-order-1', dish_id: 'h5-dish-1', quantity: 1, unit_price: 42 }],
        participants: [{ id: 'h5-order-participant-1', order_id: 'h5-order-1', user_id: 'h5-partner', status: 'invited', created_at: '2026-08-10T18:30:00Z', updated_at: '2026-08-10T18:30:00Z' }],
        created_at: '2026-08-10T18:30:00Z',
      },
    ])) as ApiResponse<T>
  }

  if (url === '/calendar/records' || url === '/calendar/records/date') {
    return ok(list([
      {
        id: 'h5-record-1',
        user_id: 'h5-preview-user',
        table_id: 'h5-buddy-table',
        record_date: today,
        meal_type: 'dineout',
        meal_period: 'dinner',
        dish_ids: [],
        restaurant: '烧鸟小馆',
        amount: 168,
        source: 'manual',
        status: 'confirmed',
        photos: [],
        comments: [],
        created_at: '2026-08-10T19:30:00Z',
      },
    ])) as ApiResponse<T>
  }
  if (url === '/calendar/stats') {
    return ok({
      total_amount: 680,
      meal_count: { cook: 8, takeout: 6, dineout: 4 },
      total_records: 18,
      unrecorded_days: [],
      year: 2026,
      month: 8,
    }) as ApiResponse<T>
  }

  if (url === '/wishes') {
    return ok(list([{ id: 'h5-wish-1', user_id: 'h5-preview-user', table_id: 'h5-buddy-table', name: '想去吃巴斯克蛋糕', note: '周末下午茶', dish_id: null, is_completed: false, created_at: '2026-08-10T09:00:00Z' }])) as ApiResponse<T>
  }
  if (url === '/basket') return ok(list(h5PreviewBasketItems)) as ApiResponse<T>
  if (url === '/budget') {
    return ok({ id: 'h5-budget', user_id: 'h5-preview-user', table_id: 'h5-personal-table', month: '2026-08', budget: 1200, spent: 680 }) as ApiResponse<T>
  }
  if (url === '/points') {
    return ok(list([
      { id: 'h5-point-1', user_id: 'h5-preview-user', points: 10, reason: '每日签到', created_at: '2026-08-14T09:00:00Z' },
      { id: 'h5-point-2', user_id: 'h5-preview-user', points: 5, reason: '连续签到奖励', created_at: '2026-08-13T08:30:00Z' },
    ])) as ApiResponse<T>
  }
  if (url.includes('/invite')) {
    return ok({ code: 'H5FANDA', expires_at: '2026-08-10T10:00:00Z' }) as ApiResponse<T>
  }

  return ok({}) as ApiResponse<T>
}
