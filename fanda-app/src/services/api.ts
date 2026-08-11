import Taro from '@tarojs/taro'
import type { ApiResponse } from '@/types'

declare const API_BASE_URL: string

// API 统一出口：封装 Taro.request、登录态处理、H5 预览 mock，并按业务域导出接口分组。
const BASE_URL = API_BASE_URL

// 是否正在跳转登录页（防止重复跳转）
let isRedirectingToLogin = false

const isH5PreviewRequest = (token: string) => {
  // 只有浏览器预览环境且 token 为登录页写入的固定值时，才拦截请求走本地 mock。
  return process.env.TARO_ENV === 'h5' && token === 'h5-preview-token'
}

// H5 预览用户：覆盖账号绑定、情侣、饭搭子等核心关系字段，保证主要页面可直接演示。
const h5User = {
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

const h5Dishes = [
  {
    id: 'h5-dish-1',
    owner_id: 'h5-preview-user',
    group_type: 'couple',
    group_id: 'h5-couple',
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
    group_type: 'couple',
    group_id: 'h5-couple',
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
]

const ok = <T>(data: T): ApiResponse<T> => ({ code: 0, message: 'ok', data })

const list = <T>(items: T[]) => ({ list: items, total: items.length, page: 1, page_size: 20 })

// H5 mock 响应路由：按真实接口 path 返回轻量数据，避免浏览器预览依赖小程序登录和后端服务。
const createH5PreviewResponse = <T>(options: Taro.request.Option): ApiResponse<T> => {
  const url = options.url || ''
  const today = new Date().toISOString().slice(0, 10)

  // 认证与个人中心相关 mock。
  if (url === '/auth/profile') return ok(h5User) as ApiResponse<T>
  if (url === '/checkin/status') return ok({ today_checked: false, month_count: 18, streak: 7 }) as ApiResponse<T>
  if (url === '/checkin') return ok({ today_checked: true, month_count: 19, streak: 8 }) as ApiResponse<T>
  // 菜品/广场 mock。
  if (url === '/dishes') return ok(list(h5Dishes)) as ApiResponse<T>
  if (url.startsWith('/dishes/')) return ok(h5Dishes[0]) as ApiResponse<T>
  if (url === '/plaza') return ok(list(h5Dishes.map((dish) => ({ ...dish, import_count: 128 })))) as ApiResponse<T>
  if (url === '/plaza/categories') return ok(['家常菜', '轻食', '快手菜', '外食灵感']) as ApiResponse<T>
  // 订单 mock。
  if (url === '/orders') {
    return ok(list([
      { id: 'h5-order-1', creator_id: 'h5-preview-user', group_type: 'couple', group_id: 'h5-couple', dine_mode: 'together', status: 'pending', total_amount: 58, order_items: [{ id: 'h5-order-item-1', order_id: 'h5-order-1', dish_id: 'h5-dish-1', quantity: 1, unit_price: 42 }], created_at: '2026-08-10T18:30:00Z' },
    ])) as ApiResponse<T>
  }
  // 日历与统计 mock。
  if (url === '/calendar/records' || url === '/calendar/records/date') {
    return ok(list([
      { id: 'h5-record-1', user_id: 'h5-preview-user', group_type: 'couple', group_id: 'h5-couple', record_date: today, meal_type: 'dineout', meal_period: 'dinner', dish_ids: [], restaurant: '烧鸟小馆', amount: 168, source: 'manual', photos: [], comments: [], created_at: '2026-08-10T19:30:00Z' },
    ])) as ApiResponse<T>
  }
  if (url === '/calendar/stats') {
    return ok({ total_amount: 680, meal_count: { cook: 8, takeout: 6, dineout: 4 }, total_records: 18, unrecorded_days: [], year: 2026, month: 8 }) as ApiResponse<T>
  }
  // 心愿、菜篮子、预算、积分和邀请 mock。
  if (url === '/wishes') return ok(list([{ id: 'h5-wish-1', user_id: 'h5-preview-user', group_type: 'couple', group_id: 'h5-couple', name: '想去吃巴斯克蛋糕', note: '周末下午茶', dish_id: null, is_completed: false, created_at: '2026-08-10T09:00:00Z' }])) as ApiResponse<T>
  if (url === '/basket') return ok(list([{ id: 'h5-basket-1', user_id: 'h5-preview-user', group_type: 'couple', group_id: 'h5-couple', name: '番茄', quantity: '3 个', is_purchased: false, created_at: '2026-08-10T09:00:00Z' }])) as ApiResponse<T>
  if (url === '/budget') return ok({ id: 'h5-budget', user_id: 'h5-preview-user', group_type: 'couple', group_id: 'h5-couple', month: '2026-08', budget: 1200, spent: 680 }) as ApiResponse<T>
  if (url === '/points/history') return ok(list([{ id: 'h5-point-1', user_id: 'h5-preview-user', points: 10, reason: '每日签到', created_at: '2026-08-10T09:00:00Z' }])) as ApiResponse<T>
  if (url.includes('/invite')) return ok({ code: 'H5FANDA', expires_at: '2026-08-10T10:00:00Z' }) as ApiResponse<T>

  return ok({}) as ApiResponse<T>
}

// 请求拦截器
const request = async <T>(options: Taro.request.Option): Promise<ApiResponse<T>> => {
  const token = Taro.getStorageSync('token')

  if (isH5PreviewRequest(token)) {
    return createH5PreviewResponse<T>(options)
  }

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.header as Record<string, string> || {}),
  }

  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }

  try {
    // 真实请求统一补 BASE_URL 和 Authorization，页面层不直接接触底层请求细节。
    const res = await Taro.request({
      ...options,
      url: `${BASE_URL}${options.url}`,
      header,
    })

    // HTTP 401: 未认证，跳转登录页
    if (res.statusCode === 401) {
      if (!isRedirectingToLogin) {
        isRedirectingToLogin = true
        Taro.removeStorageSync('token')
        Taro.reLaunch({ url: '/pages/login/index' })
      }
      throw new Error('未登录')
    }

    const data = res.data as ApiResponse<T>
    // 业务错误统一弹 toast 并抛出，让页面只处理必要的兜底文案。
    if (data.code !== 0) {
      Taro.showToast({ title: data.message, icon: 'none' })
      throw new Error(data.message)
    }
    return data
  } catch (err: any) {
    // 401 已经处理了跳转，不再显示 toast，直接抛出
    if (err.message === '未登录') {
      throw err
    }
    throw err
  }
}

// ============ 认证与关系 ============

export const authAPI = {
  login: (code: string, platform: string) =>
    request<any>({ url: '/auth/login', method: 'POST', data: { code, platform } }),

  getProfile: () =>
    request<any>({ url: '/auth/profile', method: 'GET' }),

  updateProfile: (nickname: string, avatar: string) =>
    request<any>({ url: '/auth/profile', method: 'PUT', data: { nickname, avatar } }),

  bindPhone: (phone: string) =>
    request<any>({ url: '/auth/bind-phone', method: 'POST', data: { phone } }),

  // 情侣关系：邀请与加入绑定。
  createCoupleInvite: () =>
    request<any>({ url: '/couple/invite', method: 'POST' }),

  joinCouple: (code: string) =>
    request<any>({ url: '/couple/join', method: 'POST', data: { code } }),

  // 饭搭子关系：群组、邀请、加入与成员移除。
  createBuddyGroup: (name: string) =>
    request<any>({ url: '/buddy/groups', method: 'POST', data: { name } }),

  createBuddyInvite: (groupId: string) =>
    request<any>({ url: `/buddy/groups/${groupId}/invite`, method: 'POST' }),

  joinBuddyGroup: (groupId: string, code: string) =>
    request<any>({ url: `/buddy/groups/${groupId}/join`, method: 'POST', data: { code } }),

  removeBuddyMember: (groupId: string, uid: string) =>
    request<any>({ url: `/buddy/groups/${groupId}/members/${uid}`, method: 'DELETE' }),
}

// ============ 菜品与学菜广场 ============

export const dishAPI = {
  list: (params: Record<string, any>) =>
    request<any>({ url: '/dishes', method: 'GET', data: params }),

  get: (id: string) =>
    request<any>({ url: `/dishes/${id}`, method: 'GET' }),

  create: (data: Record<string, any>) =>
    request<any>({ url: '/dishes', method: 'POST', data }),

  update: (id: string, data: Record<string, any>) =>
    request<any>({ url: `/dishes/${id}`, method: 'PUT', data }),

  delete: (id: string) =>
    request<any>({ url: `/dishes/${id}`, method: 'DELETE' }),

  importFromPlaza: (plazaId: string, groupType: string, groupId: string) =>
    request<any>({ url: '/dishes/import', method: 'POST', data: { plaza_id: plazaId, group_type: groupType, group_id: groupId } }),

  // 学菜广场：公开菜品搜索、分类与导入。
  searchPlaza: (params: Record<string, any>) =>
    request<any>({ url: '/plaza', method: 'GET', data: params }),

  getPlazaCategories: () =>
    request<any>({ url: '/plaza/categories', method: 'GET' }),
}

// ============ 订单 ============

export const orderAPI = {
  list: (params: Record<string, any>) =>
    request<any>({ url: '/orders', method: 'GET', data: params }),

  get: (id: string) =>
    request<any>({ url: `/orders/${id}`, method: 'GET' }),

  create: (data: Record<string, any>) =>
    request<any>({ url: '/orders', method: 'POST', data }),

  confirm: (id: string) =>
    request<any>({ url: `/orders/${id}/confirm`, method: 'POST' }),

  reject: (id: string) =>
    request<any>({ url: `/orders/${id}/reject`, method: 'POST' }),

  cancel: (id: string) =>
    request<any>({ url: `/orders/${id}/cancel`, method: 'POST' }),

  vote: (id: string, vote: string) =>
    request<any>({ url: `/orders/${id}/vote`, method: 'POST', data: { vote } }),

  getVotes: (id: string) =>
    request<any>({ url: `/orders/${id}/votes`, method: 'GET' }),
}

// ============ 日历记录与统计 ============

export const calendarAPI = {
  listByMonth: (groupType: string, groupId: string, year: number, month: number) =>
    request<any>({ url: '/calendar/records', method: 'GET', data: { group_type: groupType, group_id: groupId, year, month } }),

  listByDate: (groupType: string, groupId: string, date: string) =>
    request<any>({ url: '/calendar/records/date', method: 'GET', data: { group_type: groupType, group_id: groupId, date } }),

  get: (id: string) =>
    request<any>({ url: `/calendar/records/${id}`, method: 'GET' }),

  create: (data: Record<string, any>) =>
    request<any>({ url: '/calendar/records', method: 'POST', data }),

  update: (id: string, data: Record<string, any>) =>
    request<any>({ url: `/calendar/records/${id}`, method: 'PUT', data }),

  delete: (id: string) =>
    request<any>({ url: `/calendar/records/${id}`, method: 'DELETE' }),

  addComment: (id: string, content: string) =>
    request<any>({ url: `/calendar/records/${id}/comments`, method: 'POST', data: { content } }),

  addPhoto: (id: string, url: string, type: string) =>
    request<any>({ url: `/calendar/records/${id}/photos`, method: 'POST', data: { url, type } }),

  getStats: (groupType: string, groupId: string, year: number, month: number) =>
    request<any>({ url: '/calendar/stats', method: 'GET', data: { group_type: groupType, group_id: groupId, year, month } }),
}

// ============ 功能模块：心愿、签到、菜篮子、预算、积分 ============

export const featureAPI = {
  // 心愿
  listWishes: (groupType: string, groupId: string, completed?: boolean) =>
    request<any>({ url: '/wishes', method: 'GET', data: { group_type: groupType, group_id: groupId, completed } }),

  createWish: (data: Record<string, any>) =>
    request<any>({ url: '/wishes', method: 'POST', data }),

  completeWish: (id: string) =>
    request<any>({ url: `/wishes/${id}/complete`, method: 'POST' }),

  deleteWish: (id: string) =>
    request<any>({ url: `/wishes/${id}`, method: 'DELETE' }),

  // 签到
  checkin: () =>
    request<any>({ url: '/checkin', method: 'POST' }),

  getCheckinStatus: () =>
    request<any>({ url: '/checkin/status', method: 'GET' }),

  // 菜篮子
  listBasket: (groupType: string, groupId: string) =>
    request<any>({ url: '/basket', method: 'GET', data: { group_type: groupType, group_id: groupId } }),

  addToBasket: (data: Record<string, any>) =>
    request<any>({ url: '/basket', method: 'POST', data }),

  toggleBasket: (id: string) =>
    request<any>({ url: `/basket/${id}/toggle`, method: 'POST' }),

  deleteBasket: (id: string) =>
    request<any>({ url: `/basket/${id}`, method: 'DELETE' }),

  // 预算
  getBudget: (groupType: string, groupId: string, month: string) =>
    request<any>({ url: '/budget', method: 'GET', data: { group_type: groupType, group_id: groupId, month } }),

  setBudget: (data: Record<string, any>) =>
    request<any>({ url: '/budget', method: 'POST', data }),

  // 积分
  getPointHistory: (page: number, pageSize: number) =>
    request<any>({ url: '/points', method: 'GET', data: { page, page_size: pageSize } }),
}
