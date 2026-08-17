import type {
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
import { request } from './request'

// API 业务统一出口：底层请求、登录态和 H5 mock 分别由 request/auth-session/h5-preview 承担。

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
