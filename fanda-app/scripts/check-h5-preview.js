const fs = require('fs')
const path = require('path')

// H5 预览检查脚本：静态确认 package 脚本、登录页入口和 API mock 兜底仍然存在。
const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const login = fs.readFileSync(path.join(root, 'src/pages/login/index.tsx'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/services/api.ts'), 'utf8')

function assert(condition, message) {
  // 失败时抛出明确错误，便于 CI 或本地命令直接定位缺失项。
  if (!condition) {
    throw new Error(message)
  }
}

// 构建脚本与关键源码标记共同校验，避免只保留入口但删除了 mock 行为。
assert(pkg.scripts['dev:h5'] === 'taro build --type h5 --watch', 'package.json 缺少 dev:h5 脚本')
assert(pkg.scripts['build:h5'] === 'taro build --type h5', 'package.json 缺少 build:h5 脚本')
assert(login.includes("process.env.TARO_ENV === 'h5'"), '登录页缺少 H5 环境判断')
assert(login.includes('handleH5MockLogin'), '登录页缺少 H5 mock 登录函数')
assert(login.includes('h5-preview-token'), '登录页缺少 H5 mock token')
assert(login.includes('浏览器预览登录'), '登录页缺少浏览器预览登录按钮文案')
assert(api.includes('isH5PreviewRequest'), 'API 层缺少 H5 mock 请求判断')
assert(api.includes('createH5PreviewResponse'), 'API 层缺少 H5 mock 响应')

console.log('H5 preview checks passed')
