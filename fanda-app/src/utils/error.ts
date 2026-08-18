// 错误文案兜底工具：优先使用 Error.message，缺失时回落到页面传入的业务提示。
export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

// 认证异常哨兵：request.ts 对 401 抛出“未登录”，页面可据此跳过重复提示。
export const isAuthError = (error: unknown): boolean => {
  return error instanceof Error && error.message === '未登录'
}
