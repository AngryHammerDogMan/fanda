import Taro from '@tarojs/taro'

let isRedirectingToLogin = false

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
  if (isRedirectingToLogin) return
  isRedirectingToLogin = true
  clearAuthToken()
  Taro.reLaunch({ url: '/pages/login/index' })
}
