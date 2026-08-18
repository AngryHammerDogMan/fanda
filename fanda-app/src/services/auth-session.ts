import Taro from '@tarojs/taro'

// 401 跳转锁：多个并发请求同时失效时，只触发一次登录页重定向。
let isRedirectingToLogin = false

// 登录态封装：页面和请求层统一通过这里读写 token，避免散落 storage key。
export const getAuthToken = (): string => Taro.getStorageSync('token') || ''

export const setAuthToken = (token: string) => {
  isRedirectingToLogin = false
  Taro.setStorageSync('token', token)
}

export const clearAuthToken = () => {
  Taro.removeStorageSync('token')
}

export const resetAuthRedirect = () => {
  isRedirectingToLogin = false
}

export const redirectToLoginOnce = () => {
  // 清理过期 token 后重启到登录页，防止继续停留在需要认证的 tab 页面。
  if (isRedirectingToLogin) return
  isRedirectingToLogin = true
  clearAuthToken()
  Taro.reLaunch({ url: '/pages/login/index' })
}
