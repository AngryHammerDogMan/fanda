import Taro from '@tarojs/taro'
import type { ApiResponse } from '@/types'
import { getAuthToken, redirectToLoginOnce, resetAuthRedirect } from './auth-session'
import { isH5PreviewRequest } from './h5-preview-mode'

declare const API_BASE_URL: string

const BASE_URL = API_BASE_URL

const buildHeaders = (options: Taro.request.Option, token: string): Record<string, string> => {
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
