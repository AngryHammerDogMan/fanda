import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'path'

export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
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
    },
    copy: {
      patterns: [],
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
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js'
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css'
      },
      postcss: {
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
