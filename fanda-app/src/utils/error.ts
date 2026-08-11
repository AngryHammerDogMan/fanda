export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

export const isAuthError = (error: unknown): boolean => {
  return error instanceof Error && error.message === '未登录'
}
