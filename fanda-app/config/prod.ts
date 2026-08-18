import type { UserConfigExport } from '@tarojs/cli'

// 生产环境差异配置：H5 使用相对 publicPath，便于部署到非根路径静态目录。
export default {
  mini: {},
  h5: {
    // 生产 H5 资源相对当前页面加载，避免子路径部署时静态资源 404。
    publicPath: './'
  }
} satisfies UserConfigExport
