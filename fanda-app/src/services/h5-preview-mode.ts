declare const H5_PREVIEW_MOCK_ENABLED: boolean

// H5 预览开关由 config/index.ts 注入，供登录页和请求层共享同一判断。
export const isH5PreviewEnabled = (): boolean => H5_PREVIEW_MOCK_ENABLED

export const isH5PreviewRequest = (token: string): boolean => {
  // 固定预览 token 只在 H5 mock 开启时生效，避免真实接口请求被误拦截。
  return isH5PreviewEnabled() && token === 'h5-preview-token'
}
