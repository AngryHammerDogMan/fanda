import Taro from '@tarojs/taro'
import type {
  ApiResponse,
  BasketItem,
  BasketPayload,
  BuddyGroupSummary,
  BudgetPayload,
  BudgetSetting,
  CalendarListParams,
  CalendarRecord,
  CalendarRecordPayload,
  CalendarRecordUpdatePayload,
  CheckinResult,
  CheckinStatus,
  CreateOrderPayload,
  CreateWishPayload,
  Dish,
  DishListParams,
  DishPayload,
  DishUpdatePayload,
  EmptyData,
  InviteResult,
  LoginResult,
  MaybePaginatedData,
  MonthlyStats,
  Order,
  OrderListParams,
  OrderVotes,
  PaginatedData,
  PhotoPayload,
  PlazaCategoriesResponse,
  PlazaDish,
  PlazaSearchParams,
  PointRecord,
  RecordComment,
  RecordPhoto,
  Table,
  User,
  WishItem,
} from '@/types'

declare const API_BASE_URL: string

// API 统一出口：封装 Taro.request、登录态处理、H5 预览 mock，并按业务域导出接口分组。
const BASE_URL = API_BASE_URL

// 是否正在跳转登录页（防止重复跳转）
let isRedirectingToLogin = false

const isH5PreviewRequest = (token: string) => {
  // 只有浏览器预览环境且 token 为登录页写入的固定值时，才拦截请求走本地 mock。
  return process.env.TARO_ENV === 'h5' && token === 'h5-preview-token'
}

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
  // 家常菜
  {
    id: 'h5-dish-1', owner_id: 'h5-preview-user', table_id: 'h5-personal-table',
    dish_type: 'dish', name: '番茄牛腩煲', category: '家常菜', difficulty: 2, duration: 45, price: 42,
    ingredients: [{ name: '牛腩', amount: '500g' }, { name: '番茄', amount: '3 个' }],
    steps: [{ order: 1, description: '牛腩焯水后和番茄慢炖。' }],
    photos: null, tags: ['暖胃', '晚餐'], restaurant: '', restaurant_note: '',
    source: 'manual', is_deleted: false, created_at: '2026-08-10T09:00:00Z', updated_at: '2026-08-10T09:00:00Z',
  },
  {
    id: 'h5-dish-2', owner_id: 'h5-preview-user', table_id: 'h5-personal-table',
    dish_type: 'dish', name: '麻婆豆腐', category: '川菜', difficulty: 1, duration: 20, price: 18,
    ingredients: [{ name: '嫩豆腐', amount: '1 盒' }, { name: '猪肉末', amount: '100g' }],
    steps: [{ order: 1, description: '豆腐焯水，肉末炒香加豆瓣酱，与豆腐同烧。' }],
    photos: null, tags: ['下饭', '快手菜'], restaurant: '', restaurant_note: '',
    source: 'manual', is_deleted: false, created_at: '2026-08-09T09:00:00Z', updated_at: '2026-08-09T09:00:00Z',
  },
  {
    id: 'h5-dish-3', owner_id: 'h5-preview-user', table_id: 'h5-personal-table',
    dish_type: 'dish', name: '蒜蓉西兰花', category: '家常菜', difficulty: 1, duration: 12, price: 10,
    ingredients: [{ name: '西兰花', amount: '1 颗' }, { name: '蒜', amount: '5 瓣' }],
    steps: [{ order: 1, description: '西兰花焯水，蒜末爆香后翻炒调味。' }],
    photos: null, tags: ['素菜', '低卡'], restaurant: '', restaurant_note: '',
    source: 'manual', is_deleted: false, created_at: '2026-08-08T09:00:00Z', updated_at: '2026-08-08T09:00:00Z',
  },
  {
    id: 'h5-dish-4', owner_id: 'h5-preview-user', table_id: 'h5-personal-table',
    dish_type: 'dish', name: '糖醋排骨', category: '家常菜', difficulty: 3, duration: 50, price: 48,
    ingredients: [{ name: '猪小排', amount: '500g' }, { name: '冰糖', amount: '30g' }, { name: '醋', amount: '3 勺' }],
    steps: [{ order: 1, description: '排骨焯水，炒糖色后加醋和调料慢炖收汁。' }],
    photos: null, tags: ['酸甜', '聚餐'], restaurant: '', restaurant_note: '',
    source: 'manual', is_deleted: false, created_at: '2026-08-07T09:00:00Z', updated_at: '2026-08-07T09:00:00Z',
  },
  // 外卖
  {
    id: 'h5-dish-5', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'takeout', name: '牛油果鸡胸沙拉', category: '轻食', difficulty: null, duration: 28, price: 36,
    ingredients: null, steps: null, photos: null,
    tags: ['外卖', '预算内'], restaurant: '轻食研究所', restaurant_note: '适合工作日晚餐',
    source: 'manual', is_deleted: false, created_at: '2026-08-10T09:00:00Z', updated_at: '2026-08-10T09:00:00Z',
  },
  {
    id: 'h5-dish-6', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'takeout', name: '经典牛肉汉堡', category: '西餐', difficulty: null, duration: 25, price: 45,
    ingredients: null, steps: null, photos: null,
    tags: ['外卖', '午餐'], restaurant: '汉堡研究所', restaurant_note: '肉饼厚实，推荐搭配薯条',
    source: 'manual', is_deleted: false, created_at: '2026-08-09T09:00:00Z', updated_at: '2026-08-09T09:00:00Z',
  },
  {
    id: 'h5-dish-7', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'takeout', name: '寿司拼盘', category: '日料', difficulty: null, duration: 35, price: 88,
    ingredients: null, steps: null, photos: null,
    tags: ['外卖', '聚餐'], restaurant: '樱花寿司', restaurant_note: '新鲜三文鱼，性价比高',
    source: 'manual', is_deleted: false, created_at: '2026-08-08T09:00:00Z', updated_at: '2026-08-08T09:00:00Z',
  },
  {
    id: 'h5-dish-8', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'takeout', name: '酸菜鱼', category: '川菜', difficulty: null, duration: 30, price: 68,
    ingredients: null, steps: null, photos: null,
    tags: ['外卖', '聚餐'], restaurant: '太二酸菜鱼', restaurant_note: '酸辣适中，鱼肉嫩滑',
    source: 'manual', is_deleted: false, created_at: '2026-08-07T09:00:00Z', updated_at: '2026-08-07T09:00:00Z',
  },
  {
    id: 'h5-dish-9', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'takeout', name: '麻辣香锅', category: '川菜', difficulty: null, duration: 35, price: 72,
    ingredients: null, steps: null, photos: null,
    tags: ['外卖', '重口味'], restaurant: '川味香锅', restaurant_note: '自选配菜，辣度可调',
    source: 'manual', is_deleted: false, created_at: '2026-08-06T09:00:00Z', updated_at: '2026-08-06T09:00:00Z',
  },
  // 外食
  {
    id: 'h5-dish-10', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'dineout', name: '烧鸟拼盘', category: '日料', difficulty: null, duration: 60, price: 128,
    ingredients: null, steps: null, photos: null,
    tags: ['外食', '约会'], restaurant: '烧鸟小馆', restaurant_note: '氛围好，适合情侣约会',
    source: 'manual', is_deleted: false, created_at: '2026-08-10T09:00:00Z', updated_at: '2026-08-10T09:00:00Z',
  },
  {
    id: 'h5-dish-11', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'dineout', name: '重庆老火锅', category: '火锅', difficulty: null, duration: 90, price: 168,
    ingredients: null, steps: null, photos: null,
    tags: ['外食', '聚餐', '重口味'], restaurant: '重庆老灶火锅', restaurant_note: '毛肚和鸭血必点',
    source: 'manual', is_deleted: false, created_at: '2026-08-09T09:00:00Z', updated_at: '2026-08-09T09:00:00Z',
  },
  {
    id: 'h5-dish-12', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'dineout', name: '战斧牛排', category: '西餐', difficulty: null, duration: 60, price: 298,
    ingredients: null, steps: null, photos: null,
    tags: ['外食', '纪念日'], restaurant: '牛排家', restaurant_note: '五分熟最佳，配红酒',
    source: 'manual', is_deleted: false, created_at: '2026-08-08T09:00:00Z', updated_at: '2026-08-08T09:00:00Z',
  },
  {
    id: 'h5-dish-13', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'dineout', name: '广式早茶套餐', category: '粤菜', difficulty: null, duration: 75, price: 138,
    ingredients: null, steps: null, photos: null,
    tags: ['外食', '周末'], restaurant: '点都德', restaurant_note: '虾饺和凤爪一绝',
    source: 'manual', is_deleted: false, created_at: '2026-08-07T09:00:00Z', updated_at: '2026-08-07T09:00:00Z',
  },
  {
    id: 'h5-dish-14', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'dineout', name: '烤羊排', category: '烧烤', difficulty: null, duration: 50, price: 158,
    ingredients: null, steps: null, photos: null,
    tags: ['外食', '聚餐'], restaurant: '很久以前羊肉串', restaurant_note: '外焦里嫩，孜然味足',
    source: 'manual', is_deleted: false, created_at: '2026-08-06T09:00:00Z', updated_at: '2026-08-06T09:00:00Z',
  },
  // 面食小吃
  {
    id: 'h5-dish-15', owner_id: 'h5-preview-user', table_id: 'h5-personal-table',
    dish_type: 'dish', name: '番茄鸡蛋面', category: '面食', difficulty: 1, duration: 15, price: 12,
    ingredients: [{ name: '面条', amount: '200g' }, { name: '番茄', amount: '2 个' }, { name: '鸡蛋', amount: '2 个' }],
    steps: [{ order: 1, description: '炒蛋备用，番茄炒出汁加水煮面，放入炒蛋。' }],
    photos: null, tags: ['快手菜', '一人食'], restaurant: '', restaurant_note: '',
    source: 'manual', is_deleted: false, created_at: '2026-08-06T09:00:00Z', updated_at: '2026-08-06T09:00:00Z',
  },
  {
    id: 'h5-dish-16', owner_id: 'h5-preview-user', table_id: 'h5-buddy-table',
    dish_type: 'takeout', name: '芒果糯米饭', category: '甜品', difficulty: null, duration: 20, price: 32,
    ingredients: null, steps: null, photos: null,
    tags: ['外卖', '甜品'], restaurant: '泰式甜品屋', restaurant_note: '椰浆浓郁，芒果新鲜',
    source: 'manual', is_deleted: false, created_at: '2026-08-05T09:00:00Z', updated_at: '2026-08-05T09:00:00Z',
  },
]

let h5PreviewBasketItems: BasketItem[] = [
  { id: 'h5-basket-1', user_id: 'h5-preview-user', table_id: 'h5-personal-table', name: '番茄', quantity: '3 个', is_purchased: false, created_at: '2026-08-10T09:00:00Z' },
]

const ok = <T>(data: T): ApiResponse<T> => ({ code: 0, message: 'ok', data })

const list = <T>(items: T[]): PaginatedData<T> => ({ list: items, total: items.length, page: 1, page_size: 20 })

// H5 mock 响应路由：按真实接口 path 返回轻量数据，避免浏览器预览依赖小程序登录和后端服务。
const createH5PreviewResponse = <T>(options: Taro.request.Option): ApiResponse<T> => {
  const url = options.url || ''
  const today = new Date().toISOString().slice(0, 10)

  // 认证与个人中心相关 mock。
  if (url === '/auth/profile') return ok(h5User) as ApiResponse<T>
  if (url === '/tables') return ok(h5Tables) as ApiResponse<T>
  if (url === '/checkin/status') return ok({ today_checked: false, month_count: 18, streak: 7 }) as ApiResponse<T>
  if (url === '/checkin') return ok({ points: 2, checkin_date: '2026-08-14' }) as ApiResponse<T>
  // 菜品/广场 mock。
  if (url === '/dishes') return ok(list(h5Dishes)) as ApiResponse<T>
  if (url.startsWith('/dishes/')) return ok(h5Dishes[0]) as ApiResponse<T>
  if (url === '/plaza') return ok(list(h5Dishes.map((dish) => ({ ...dish, import_count: 128 })))) as ApiResponse<T>
  if (url === '/plaza/categories') return ok(['家常菜', '轻食', '快手菜', '外食灵感']) as ApiResponse<T>
  // 订单 mock。
  if (url === '/orders') {
    if (options.method === 'POST') {
      const payload = options.data as CreateOrderPayload
      const createdAt = new Date().toISOString()
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
      const totalAmount = payload.items.reduce((sum, item) => sum + ((item.unit_price || 0) * item.quantity), 0)
      return ok({
        id: `h5-order-${Date.now()}`,
        creator_id: 'h5-preview-user',
        table_id: payload.table_id,
        dine_mode: payload.dine_mode,
        status: payload.dine_mode === 'together' ? 'pending' : 'confirmed',
        total_amount: totalAmount,
        calendar_record_id: `h5-record-${Date.now()}`,
        order_items: payload.items.map((item, index) => ({
          id: `h5-order-item-${index}`,
          order_id: `h5-order-${Date.now()}`,
          dish_id: item.dish_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
        participants: [],
        created_at: createdAt,
      }) as ApiResponse<T>
    }
    return ok(list([
      { id: 'h5-order-1', creator_id: 'h5-preview-user', table_id: 'h5-buddy-table', dine_mode: 'together', status: 'pending', total_amount: 58, order_items: [{ id: 'h5-order-item-1', order_id: 'h5-order-1', dish_id: 'h5-dish-1', quantity: 1, unit_price: 42 }], participants: [{ id: 'h5-order-participant-1', order_id: 'h5-order-1', user_id: 'h5-partner', status: 'invited', created_at: '2026-08-10T18:30:00Z', updated_at: '2026-08-10T18:30:00Z' }], created_at: '2026-08-10T18:30:00Z' },
    ])) as ApiResponse<T>
  }
  // 日历与统计 mock。
  if (url === '/calendar/records' || url === '/calendar/records/date') {
    return ok(list([
      { id: 'h5-record-1', user_id: 'h5-preview-user', table_id: 'h5-buddy-table', record_date: today, meal_type: 'dineout', meal_period: 'dinner', dish_ids: [], restaurant: '烧鸟小馆', amount: 168, source: 'manual', status: 'confirmed', photos: [], comments: [], created_at: '2026-08-10T19:30:00Z' },
    ])) as ApiResponse<T>
  }
  if (url === '/calendar/stats') {
    return ok({ total_amount: 680, meal_count: { cook: 8, takeout: 6, dineout: 4 }, total_records: 18, unrecorded_days: [], year: 2026, month: 8 }) as ApiResponse<T>
  }
  // 心愿、菜篮子、预算、积分和邀请 mock。
  if (url === '/wishes') return ok(list([{ id: 'h5-wish-1', user_id: 'h5-preview-user', table_id: 'h5-buddy-table', name: '想去吃巴斯克蛋糕', note: '周末下午茶', dish_id: null, is_completed: false, created_at: '2026-08-10T09:00:00Z' }])) as ApiResponse<T>
  if (url === '/basket') return ok(list(h5PreviewBasketItems)) as ApiResponse<T>
  if (url === '/budget') return ok({ id: 'h5-budget', user_id: 'h5-preview-user', table_id: 'h5-personal-table', month: '2026-08', budget: 1200, spent: 680 }) as ApiResponse<T>
  if (url === '/points') return ok(list([
    { id: 'h5-point-1', user_id: 'h5-preview-user', points: 10, reason: '每日签到', created_at: '2026-08-14T09:00:00Z' },
    { id: 'h5-point-2', user_id: 'h5-preview-user', points: 5, reason: '连续签到奖励', created_at: '2026-08-13T08:30:00Z' },
    { id: 'h5-point-3', user_id: 'h5-preview-user', points: -20, reason: '兑换优惠券', created_at: '2026-08-12T14:20:00Z' },
    { id: 'h5-point-4', user_id: 'h5-preview-user', points: 10, reason: '每日签到', created_at: '2026-08-12T09:00:00Z' },
    { id: 'h5-point-5', user_id: 'h5-preview-user', points: 30, reason: '邀请好友注册', created_at: '2026-08-11T16:45:00Z' },
    { id: 'h5-point-6', user_id: 'h5-preview-user', points: -15, reason: '消费抵扣', created_at: '2026-08-10T12:30:00Z' },
    { id: 'h5-point-7', user_id: 'h5-preview-user', points: 10, reason: '每日签到', created_at: '2026-08-10T09:00:00Z' },
    { id: 'h5-point-8', user_id: 'h5-preview-user', points: 50, reason: '新用户注册奖励', created_at: '2026-08-09T10:00:00Z' },
    { id: 'h5-point-9', user_id: 'h5-preview-user', points: 10, reason: '每日签到', created_at: '2026-08-09T09:00:00Z' },
    { id: 'h5-point-10', user_id: 'h5-preview-user', points: 20, reason: '完善个人资料', created_at: '2026-08-08T15:00:00Z' },
    { id: 'h5-point-11', user_id: 'h5-preview-user', points: 10, reason: '每日签到', created_at: '2026-08-08T09:00:00Z' },
    { id: 'h5-point-12', user_id: 'h5-preview-user', points: -5, reason: '消费抵扣', created_at: '2026-08-07T18:30:00Z' },
  ])) as ApiResponse<T>
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
  } catch (err: unknown) {
    // 401 已经处理了跳转，不再显示 toast，直接抛出
    if (err instanceof Error && err.message === '未登录') {
      throw err
    }
    throw err
  }
}

// ============ 认证与成员关系 ============

export const authAPI = {
  login: (code: string, platform: string) =>
    request<LoginResult>({ url: '/auth/login', method: 'POST', data: { code, platform } }),

  getProfile: () =>
    request<User>({ url: '/auth/profile', method: 'GET' }),

  updateProfile: (nickname: string, avatar: string) =>
    request<EmptyData>({ url: '/auth/profile', method: 'PUT', data: { nickname, avatar } }),

  bindPhone: (phone: string) =>
    request<EmptyData>({ url: '/auth/bind-phone', method: 'POST', data: { phone } }),

  // 伴侣关系：邀请与加入绑定。
  createCoupleInvite: () =>
    request<InviteResult>({ url: '/couple/invite', method: 'POST' }),

  joinCouple: (code: string) =>
    request<EmptyData>({ url: '/couple/join', method: 'POST', data: { code } }),

  // 饭搭子关系：群组、邀请、加入与成员移除。
  createBuddyGroup: (name: string) =>
    request<BuddyGroupSummary>({ url: '/buddy/groups', method: 'POST', data: { name } }),

  createBuddyInvite: (groupId: string) =>
    request<InviteResult>({ url: `/buddy/groups/${groupId}/invite`, method: 'POST' }),

  joinBuddyGroup: (groupId: string, code: string) =>
    request<EmptyData>({ url: `/buddy/groups/${groupId}/join`, method: 'POST', data: { code } }),

  removeBuddyMember: (groupId: string, uid: string) =>
    request<EmptyData>({ url: `/buddy/groups/${groupId}/members/${uid}`, method: 'DELETE' }),
}

// ============ 餐桌 ============

export const tableAPI = {
  list: () =>
    request<Table[]>({ url: '/tables', method: 'GET' }),

  rename: (id: string, name: string) =>
    request<Table>({ url: `/tables/${id}`, method: 'PUT', data: { name } }),
}

// ============ 菜品与学菜广场 ============

export const dishAPI = {
  list: (params: DishListParams) =>
    request<PaginatedData<Dish>>({ url: '/dishes', method: 'GET', data: params }),

  get: (id: string) =>
    request<Dish>({ url: `/dishes/${id}`, method: 'GET' }),

  create: (data: DishPayload) =>
    request<Dish>({ url: '/dishes', method: 'POST', data }),

  update: (id: string, data: DishUpdatePayload) =>
    request<EmptyData>({ url: `/dishes/${id}`, method: 'PUT', data }),

  delete: (id: string) =>
    request<EmptyData>({ url: `/dishes/${id}`, method: 'DELETE' }),

  importFromPlaza: (plazaId: string, tableId: string) =>
    request<Dish>({ url: '/dishes/import', method: 'POST', data: { plaza_id: plazaId, table_id: tableId } }),

  // 学菜广场：公开菜品搜索、分类与导入。
  searchPlaza: (params: PlazaSearchParams) =>
    request<PaginatedData<PlazaDish>>({ url: '/plaza', method: 'GET', data: params }),

  getPlazaCategories: () =>
    request<PlazaCategoriesResponse>({ url: '/plaza/categories', method: 'GET' }),
}

// ============ 订单 ============

export const orderAPI = {
  list: (params: OrderListParams) =>
    request<PaginatedData<Order>>({ url: '/orders', method: 'GET', data: params }),

  get: (id: string) =>
    request<Order>({ url: `/orders/${id}`, method: 'GET' }),

  create: (data: CreateOrderPayload) =>
    request<Order>({ url: '/orders', method: 'POST', data }),

  confirm: (id: string) =>
    request<EmptyData>({ url: `/orders/${id}/confirm`, method: 'POST' }),

  reject: (id: string) =>
    request<EmptyData>({ url: `/orders/${id}/reject`, method: 'POST' }),

  cancel: (id: string) =>
    request<EmptyData>({ url: `/orders/${id}/cancel`, method: 'POST' }),

  vote: (id: string, vote: string) =>
    request<EmptyData>({ url: `/orders/${id}/vote`, method: 'POST', data: { vote } }),

  getVotes: (id: string) =>
    request<OrderVotes>({ url: `/orders/${id}/votes`, method: 'GET' }),
}

// ============ 日历记录与统计 ============

export const calendarAPI = {
  listByMonth: (tableId: string, year: number, month: number) =>
    request<MaybePaginatedData<CalendarRecord>>({ url: '/calendar/records', method: 'GET', data: { table_id: tableId, year, month } satisfies CalendarListParams }),

  listByDate: (tableId: string, date: string) =>
    request<MaybePaginatedData<CalendarRecord>>({ url: '/calendar/records/date', method: 'GET', data: { table_id: tableId, date } satisfies CalendarListParams }),

  get: (id: string) =>
    request<CalendarRecord>({ url: `/calendar/records/${id}`, method: 'GET' }),

  create: (data: CalendarRecordPayload) =>
    request<CalendarRecord>({ url: '/calendar/records', method: 'POST', data }),

  update: (id: string, data: CalendarRecordUpdatePayload) =>
    request<EmptyData>({ url: `/calendar/records/${id}`, method: 'PUT', data }),

  delete: (id: string) =>
    request<EmptyData>({ url: `/calendar/records/${id}`, method: 'DELETE' }),

  addComment: (id: string, content: string) =>
    request<RecordComment>({ url: `/calendar/records/${id}/comments`, method: 'POST', data: { content } }),

  addPhoto: (id: string, url: string, type: string) =>
    request<RecordPhoto>({ url: `/calendar/records/${id}/photos`, method: 'POST', data: { url, type } satisfies PhotoPayload }),

  getStats: (tableId: string, year: number, month: number) =>
    request<MonthlyStats>({ url: '/calendar/stats', method: 'GET', data: { table_id: tableId, year, month } satisfies CalendarListParams }),
}

// ============ 功能模块：心愿、签到、菜篮子、预算、积分 ============

export const featureAPI = {
  // 心愿
  listWishes: (tableId: string, completed?: boolean) =>
    request<MaybePaginatedData<WishItem>>({ url: '/wishes', method: 'GET', data: { table_id: tableId, completed } }),

  createWish: (data: CreateWishPayload) =>
    request<WishItem>({ url: '/wishes', method: 'POST', data }),

  completeWish: (id: string) =>
    request<EmptyData>({ url: `/wishes/${id}/complete`, method: 'POST' }),

  deleteWish: (id: string) =>
    request<EmptyData>({ url: `/wishes/${id}`, method: 'DELETE' }),

  // 签到
  checkin: () =>
    request<CheckinResult>({ url: '/checkin', method: 'POST' }),

  getCheckinStatus: () =>
    request<CheckinStatus>({ url: '/checkin/status', method: 'GET' }),

  // 菜篮子
  listBasket: (tableId: string) =>
    request<MaybePaginatedData<BasketItem>>({ url: '/basket', method: 'GET', data: { table_id: tableId } }),

  addToBasket: (data: BasketPayload) =>
    request<BasketItem>({ url: '/basket', method: 'POST', data }),

  toggleBasket: (id: string) =>
    request<EmptyData>({ url: `/basket/${id}/toggle`, method: 'POST' }),

  deleteBasket: (id: string) =>
    request<EmptyData>({ url: `/basket/${id}`, method: 'DELETE' }),

  // 预算
  getBudget: (tableId: string, month: string) =>
    request<BudgetSetting>({ url: '/budget', method: 'GET', data: { table_id: tableId, month } }),

  setBudget: (data: BudgetPayload) =>
    request<BudgetSetting>({ url: '/budget', method: 'POST', data }),

  // 积分
  getPointHistory: (page: number, pageSize: number) =>
    request<PaginatedData<PointRecord>>({ url: '/points', method: 'GET', data: { page, page_size: pageSize } }),
}
