const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function assertIncludes(file, expected) {
  const content = read(file)
  if (!content.includes(expected)) {
    throw new Error(`${file} 缺少 ${expected}`)
  }
}

function assertExists(rel) {
  if (!fs.existsSync(path.join(root, rel))) {
    throw new Error(`缺少文件 ${rel}`)
  }
}

const tokens = [
  '--color-paper: #FFF8F0',
  '--color-ink: #2A160D',
  '--color-card: #FFFFFF',
  '--color-sticker-shadow',
  '--radius-card: 24px',
]

tokens.forEach((token) => assertIncludes('src/app.scss', token))

const classChecks = [
  ['src/pages/index/index.tsx', 'fanda-hero'],
  ['src/pages/index/index.tsx', 'sticker-icon'],
  ['src/pages/dishes/index.tsx', 'fanda-filter'],
  ['src/pages/calendar/index.tsx', 'budget-banner'],
  ['src/pages/profile/index.tsx', 'profile-hero'],
  ['src/pages/login/index.tsx', 'login-hero'],
]

classChecks.forEach(([file, marker]) => assertIncludes(file, marker))

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
