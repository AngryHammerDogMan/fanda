import type { UserConfigExport } from '@tarojs/cli'

export default {
  logger: {
    quiet: false,
    stats: true
  },
  mini: {},
  h5: {
    devServer: {
      host: 'localhost',
      port: 10086,
      open: 'http://localhost:10086/'
    }
  }
} satisfies UserConfigExport
