declare const H5_PREVIEW_MOCK_ENABLED: boolean

export const isH5PreviewEnabled = (): boolean => H5_PREVIEW_MOCK_ENABLED

export const isH5PreviewRequest = (token: string): boolean => {
  return isH5PreviewEnabled() && token === 'h5-preview-token'
}
