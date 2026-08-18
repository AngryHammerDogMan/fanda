import type { UserConfigExport } from '@tarojs/cli'

// 开发环境差异配置：打开日志并固定 H5 devServer 端口，方便本地预览。
export default {
  logger: {
    // quiet=false 保留编译提示；stats=true 输出构建统计，便于排查资源体积。
    quiet: false,
    stats: true
  },
  mini: {},
  h5: {
    devServer: {
      // H5 本地预览入口，scripts/dev-h5.js 会在此基础上注入 mock 开关。
      host: 'localhost',
      port: 10086,
      open: 'http://localhost:10086/'
    }
  }
} satisfies UserConfigExport
