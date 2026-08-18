import Taro from '@tarojs/taro'
import type { ApiResponse } from '@/types'
import { getAuthToken, redirectToLoginOnce, resetAuthRedirect } from './auth-session'
import { isH5PreviewRequest } from './h5-preview-mode'

declare const API_BASE_URL: string

// API 基础地址由 Taro defineConstants 注入，避免页面层硬编码环境地址。
const BASE_URL = API_BASE_URL

const buildHeaders = (options: Taro.request.Option, token: string): Record<string, string> => {
  // 合并调用方 header，并在存在 token 时统一追加 Bearer 认证头。
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.header as Record<string, string> || {}),
  }

  if (token) {
    header['Authorization'] = `Bearer ${token}`
  }

  return header
}

const normalizeApiResponse = <T>(data: unknown): ApiResponse<T> => {
  // 后端统一响应 code=0 表示成功；非 0 交由调用页按异常流程提示。
  const response = data as ApiResponse<T>

  if (response.code !== 0) {
    Taro.showToast({ title: response.message, icon: 'none' })
    throw new Error(response.message)
  }

  return response
}

// 请求拦截器：统一真实请求、Authorization、401 跳转、响应校验和 H5 预览 mock。
export const request = async <T>(options: Taro.request.Option): Promise<ApiResponse<T>> => {
  const token = getAuthToken()

  if (isH5PreviewRequest(token)) {
    // H5 预览 token 命中时走本地 mock，避免浏览器环境依赖真实小程序登录。
    const { createH5PreviewResponse } = await import('./h5-preview')
    return createH5PreviewResponse<T>(options)
  }

  try {
    const res = await Taro.request({
      ...options,
      url: `${BASE_URL}${options.url}`,
      header: buildHeaders(options, token),
    })

    if (res.statusCode === 401) {
      redirectToLoginOnce()
      throw new Error('未登录')
    }

    resetAuthRedirect()
    return normalizeApiResponse<T>(res.data)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === '未登录') {
      throw err
    }
    throw err
  }
}
