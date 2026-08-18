import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'path'

// H5 入口体积告警阈值：只影响构建提示，不改变分包策略。
const H5_ENTRYPOINT_WARNING_LIMIT_KIB = 340

export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  // H5 预览 mock 仅在本地 H5 开发且显式开启时生效，避免污染生产构建。
  const h5PreviewMockEnabled = process.env.TARO_ENV === 'h5'
    && process.env.NODE_ENV !== 'production'
    && process.env.ENABLE_H5_PREVIEW_MOCK === 'true'

  // Taro 主配置：声明源码目录、构建产物、跨端编译器、别名和平台差异配置。
  const baseConfig: UserConfigExport = {
    projectName: 'fanda-app',
    date: '2026-8-8',
    // 设计稿宽度与设备换算比例，用于 Taro pxtransform 适配小程序/H5。
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: [
      '@tarojs/plugin-framework-react',
    ],
    defineConstants: {
      // 注入运行期 API 地址与 H5 预览开关，供 services/request 与登录页读取。
      API_BASE_URL: JSON.stringify(process.env.API_BASE_URL || 'http://localhost:8080/api/v1'),
      H5_PREVIEW_MOCK_ENABLED: JSON.stringify(h5PreviewMockEnabled),
    },
    copy: {
      patterns: [
        {
          // 静态贴纸和 tabbar 图标随构建复制，排除系统隐藏文件。
          from: 'src/assets',
          to: 'dist/assets',
          ignore: ['**/.DS_Store']
        }
      ],
      options: {}
    },
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false
    },
    alias: {
      '@': path.resolve(__dirname, '..', 'src'),
    },
    mini: {
      postcss: {
        pxtransform: {
          // 小程序端保留 rpx/px 转换，沿用 Taro 默认转换参数。
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      }
    },
    h5: {
      // H5 静态资源根路径与懒加载路由设置，确保本地预览和生产部署资源路径一致。
      publicPath: '/',
      staticDirectory: 'static',
      router: {
        lazyload: true
      },
      output: {
        // JS/CSS 产物使用 hash，降低浏览器缓存命中旧资源的风险。
        filename: 'js/[name].[contenthash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      webpackChain(chain) {
        // H5 拆包策略：抽离 runtime 与公共依赖，控制入口包体积。
        chain.optimization.runtimeChunk('single')
        chain.optimization.splitChunks({
          chunks: 'all',
          maxSize: 220 * 1024,
          cacheGroups: {
            defaultVendors: {
              test: /[\\/]node_modules[\\/]/,
              priority: -10,
              reuseExistingChunk: true
            },
            default: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true
            }
          }
        })
        chain.performance.maxEntrypointSize(H5_ENTRYPOINT_WARNING_LIMIT_KIB * 1024)
      },
      miniCssExtractPluginOption: {
        // 多页面样式存在共享顺序，忽略顺序告警并输出带 hash 的 CSS 文件。
        ignoreOrder: true,
        filename: 'css/[name].[contenthash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        pxtransform: {
          // H5 端固定 rem 根字号区间，避免不同视口下布局比例漂移。
          enable: true,
          config: {
            minRootSize: 12,
            maxRootSize: 12
          }
        },
        autoprefixer: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      }
    },
    rn: {
      appName: 'SharedMenuApp',
      postcss: {
        cssModules: {
          enable: false
        }
      }
    }
  }
  // 根据 NODE_ENV 合并开发/生产差异配置，业务代码读取的是合并后的最终 Taro 配置。
  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, require('./dev').default)
  }
  return merge({}, baseConfig, require('./prod').default)
})
