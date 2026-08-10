const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const login = fs.readFileSync(path.join(root, 'src/pages/login/index.tsx'), 'utf8')
const api = fs.readFileSync(path.join(root, 'src/services/api.ts'), 'utf8')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

assert(pkg.scripts['dev:h5'] === 'taro build --type h5 --watch', 'package.json 缺少 dev:h5 脚本')
assert(pkg.scripts['build:h5'] === 'taro build --type h5', 'package.json 缺少 build:h5 脚本')
assert(login.includes("process.env.TARO_ENV === 'h5'"), '登录页缺少 H5 环境判断')
assert(login.includes('handleH5MockLogin'), '登录页缺少 H5 mock 登录函数')
assert(login.includes('h5-preview-token'), '登录页缺少 H5 mock token')
assert(login.includes('浏览器预览登录'), '登录页缺少浏览器预览登录按钮文案')
assert(api.includes('isH5PreviewRequest'), 'API 层缺少 H5 mock 请求判断')
assert(api.includes('createH5PreviewResponse'), 'API 层缺少 H5 mock 响应')

console.log('H5 preview checks passed')
