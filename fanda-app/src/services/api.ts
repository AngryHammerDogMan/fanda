import Taro from '@tarojs/taro'
import type { ApiResponse } from '@/types'

// 开发环境 API 地址，上线后替换为正式域名
const BASE_URL = 'http://localhost:8080/api/v1'

// 是否正在跳转登录页（防止重复跳转）
let isRedirectingToLogin = false

// 请求拦截器
const request = async <T>(options: Taro.request.Option): Promise<ApiResponse<T>> => {
  const token = Taro.getStorageSync('token')

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.header as Record<string, string> || {}),
  }

  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }

  try {
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

// ============ 认证 ============

export const authAPI = {
  login: (code: string, platform: string) =>
    request<any>({ url: '/auth/login', method: 'POST', data: { code, platform } }),

  loginByPhone: (phone: string) =>
    request<any>({ url: '/auth/login/phone', method: 'POST', data: { phone } }),

  getProfile: () =>
    request<any>({ url: '/auth/profile', method: 'GET' }),

  updateProfile: (nickname: string, avatar: string) =>
    request<any>({ url: '/auth/profile', method: 'PUT', data: { nickname, avatar } }),

  generateBindCode: () =>
    request<any>({ url: '/auth/bind-code', method: 'POST' }),

  bindPlatform: (bindCode: string) =>
    request<any>({ url: '/auth/bind', method: 'POST', data: { bind_code: bindCode } }),

  bindPhone: (phone: string) =>
    request<any>({ url: '/auth/bind-phone', method: 'POST', data: { phone } }),

  // 情侣
  createCoupleInvite: () =>
    request<any>({ url: '/couple/invite', method: 'POST' }),

  joinCouple: (code: string) =>
    request<any>({ url: '/couple/join', method: 'POST', data: { code } }),

  // 饭搭子
  createBuddyGroup: (name: string) =>
    request<any>({ url: '/buddy/groups', method: 'POST', data: { name } }),

  createBuddyInvite: (groupId: string) =>
    request<any>({ url: `/buddy/groups/${groupId}/invite`, method: 'POST' }),

  joinBuddyGroup: (groupId: string, code: string) =>
    request<any>({ url: `/buddy/groups/${groupId}/join`, method: 'POST', data: { code } }),

  removeBuddyMember: (groupId: string, uid: string) =>
    request<any>({ url: `/buddy/groups/${groupId}/members/${uid}`, method: 'DELETE' }),
}

// ============ 菜品 ============

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

  // 学菜广场
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

// ============ 日历 ============

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

// ============ 功能模块 ============

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