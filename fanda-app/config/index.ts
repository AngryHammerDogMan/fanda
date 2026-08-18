import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'path'

const H5_ENTRYPOINT_WARNING_LIMIT_KIB = 340

export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  const h5PreviewMockEnabled = process.env.TARO_ENV === 'h5'
    && process.env.NODE_ENV !== 'production'
    && process.env.ENABLE_H5_PREVIEW_MOCK === 'true'

  const baseConfig: UserConfigExport = {
    projectName: 'fanda-app',
    date: '2026-8-8',
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
      API_BASE_URL: JSON.stringify(process.env.API_BASE_URL || 'http://localhost:8080/api/v1'),
      H5_PREVIEW_MOCK_ENABLED: JSON.stringify(h5PreviewMockEnabled),
    },
    copy: {
      patterns: [
        {
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
      publicPath: '/',
      staticDirectory: 'static',
      router: {
        lazyload: true
      },
      output: {
        filename: 'js/[name].[contenthash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      webpackChain(chain) {
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
        ignoreOrder: true,
        filename: 'css/[name].[contenthash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
        pxtransform: {
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
  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, require('./dev').default)
  }
  return merge({}, baseConfig, require('./prod').default)
})
