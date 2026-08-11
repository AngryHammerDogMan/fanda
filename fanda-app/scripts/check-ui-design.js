const fs = require('fs')
const path = require('path')

// UI 设计检查脚本：用静态标记守住全局设计 token、关键页面类名和贴纸资源。
const root = path.resolve(__dirname, '..')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(file, expected) {
  // 检查源码中必须保留的样式 token 或 class 标记。
  const content = read(file)
  if (!content.includes(expected)) {
    throw new Error(`${file} 缺少 ${expected}`)
  }
}

function assertExists(rel) {
  // 检查贴纸资源是否存在，避免页面引用的静态资源在构建后缺失。
  if (!fs.existsSync(path.join(root, rel))) {
    throw new Error(`缺少文件 ${rel}`)
  }
}

// 全局设计 token 是多页面视觉统一的基础。
const tokens = [
  '--color-paper: #FFF8F0',
  '--color-ink: #2A160D',
  '--color-card: #FFFFFF',
  '--color-sticker-shadow',
  '--radius-card: 24px',
]

tokens.forEach((token) => assertIncludes('src/app.scss', token))

// 页面级 class 标记用于确认关键页面仍接入饭搭视觉样式。
const classChecks = [
  ['src/pages/index/index.tsx', 'fanda-hero'],
  ['src/pages/index/index.tsx', 'sticker-icon'],
  ['src/pages/dishes/index.tsx', 'fanda-filter'],
  ['src/pages/calendar/index.tsx', 'budget-banner'],
  ['src/pages/profile/index.tsx', 'profile-hero'],
  ['src/pages/login/index.tsx', 'login-hero'],
]

classChecks.forEach(([file, marker]) => assertIncludes(file, marker))

// 贴纸资源覆盖 tab、快捷入口和各业务空态。
const stickers = [
  'home',
  'menu',
  'calendar',
  'profile',
  'order',
  'basket',
  'wish',
  'budget',
  'plaza',
  'couple',
  'buddy',
  'checkin',
]

stickers.forEach((name) => assertExists(`src/assets/stickers/${name}.png`))

console.log('UI design checks passed')
