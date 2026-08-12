const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pagesDir = path.join(process.cwd(), 'fanda-app/src/pages')

function collectSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath)
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

test('page files avoid any-typed catches and any-valued query records', () => {
  const offenders = collectSourceFiles(pagesDir).flatMap((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    const relativePath = path.relative(process.cwd(), filePath)
    const matches = []

    if (/catch \(err: any\)/.test(source)) {
      matches.push(`${relativePath}: catch (err: any)`)
    }

    if (/Record<string,\s*any>/.test(source)) {
      matches.push(`${relativePath}: Record<string, any>`)
    }

    if (/\bany\b/.test(source)) {
      matches.push(`${relativePath}: any`)
    }

    if (/as any/.test(source)) {
      matches.push(`${relativePath}: as any`)
    }

    return matches
  })

  assert.deepEqual(offenders, [])
})

test('ordering page uses table flow instead of group selector steps', () => {
  const ordersCreateContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.tsx'),
    'utf8'
  )

  assert(!ordersCreateContent.includes('群组类型'), 'orders/create must not show group type step')
  assert(!ordersCreateContent.includes('选择群组'), 'orders/create must not show group picker step')
  assert(
    ordersCreateContent.includes('last-order-table-id') || ordersCreateContent.includes('LAST_ORDER_TABLE_KEY'),
    'orders/create must remember last table'
  )
})

test('ordering page uses vertical category navigation with dish scroll sync', () => {
  const ordersCreateContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.tsx'),
    'utf8'
  )

  assert(ordersCreateContent.includes('category-sidebar'), 'orders/create must render a left category sidebar')
  assert(ordersCreateContent.includes('dish-section'), 'orders/create must render grouped dish sections')
  assert(ordersCreateContent.includes('scrollIntoView'), 'orders/create must scroll dishes when a category is selected')
  assert(ordersCreateContent.includes('onScroll={handleDishScroll}'), 'orders/create must sync active category while dishes scroll')
})

test('ordering page uses integrated delivery-style visual structure', () => {
  const ordersCreateContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.tsx'),
    'utf8'
  )
  const ordersCreateStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.scss'),
    'utf8'
  )

  assert(ordersCreateContent.includes('order-table-strip'), 'orders/create must use a lightweight table strip')
  assert(ordersCreateContent.includes('order-menu-panel'), 'orders/create must wrap categories and dishes in one menu panel')
  assert(ordersCreateContent.includes('dish-row'), 'orders/create must render dishes as continuous rows')
  assert(!ordersCreateContent.includes("className='dish-card'"), 'orders/create must not render dish cards in the ordering list')
  assert(!ordersCreateStyle.includes('.table-card'), 'orders/create style must not keep the heavy table card')
  assert(!ordersCreateStyle.includes('box-shadow: var(--shadow-sm);\\n}'), 'orders/create must avoid card-like shadow on the main menu modules')
})

test('ordering page confirms basket purchase items before submitting', () => {
  const ordersCreateContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.tsx'),
    'utf8'
  )

  assert(ordersCreateContent.includes('确认本餐'), 'orders/create must show an order confirmation sheet')
  assert(ordersCreateContent.includes('needPurchase'), 'orders/create must default purchase requirement to off')
  assert(ordersCreateContent.includes('purchaseCandidates'), 'orders/create must derive purchase candidates from selected dishes')
  assert(ordersCreateContent.includes('selectedPurchaseKeys'), 'orders/create must submit only checked purchase items')
  assert(ordersCreateContent.includes('setSelectedPurchaseKeys(purchaseCandidates.map(item => item.key))'), 'orders/create must select all purchase candidates when purchase is enabled')
  assert(ordersCreateContent.includes('basket_items'), 'orders/create must send selected purchase items in order payload')
})

test('ordering page uses invite switch only for multi-member tables', () => {
  const ordersCreateContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.tsx'),
    'utf8'
  )

  assert(ordersCreateContent.includes('needInvite'), 'orders/create must model invite as a switch')
  assert(ordersCreateContent.includes('canInviteMembers'), 'orders/create must only show invite controls for multi-member tables')
  assert(ordersCreateContent.includes('setNeedInvite(members.length > 0)'), 'orders/create must enable invite by default only when members exist')
  assert(!ordersCreateContent.includes('checkout-mode-row'), 'orders/create must not use dining mode choice cards')
  assert(!ordersCreateContent.includes('自己记一餐'), 'orders/create must not show self-record as an explicit feature')
})

test('ordering page opens cart detail sheet for item editing', () => {
  const ordersCreateContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.tsx'),
    'utf8'
  )
  const ordersCreateStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.scss'),
    'utf8'
  )

  assert(ordersCreateContent.includes('showCartSheet'), 'orders/create must keep cart detail sheet state')
  assert(ordersCreateContent.includes('cart-detail-sheet'), 'orders/create must render a cart detail sheet')
  assert(ordersCreateContent.includes('handleClearCart'), 'orders/create must support clearing the cart')
  assert(ordersCreateContent.includes('购物车明细'), 'orders/create must label the cart detail sheet')
  assert(ordersCreateContent.includes('dish-list-quantity-control'), 'dish list must use a dedicated quantity control')
  assert(ordersCreateContent.includes('event.stopPropagation()'), 'quantity buttons must stop event propagation in scroll rows')
  assert(ordersCreateContent.includes("handleQuantityChange(item.dish.id, -1)"), 'cart detail must allow quantity decrease and removal')
  assert(ordersCreateStyle.includes('\n}\n\n.cart-open-area {'), 'cart open area styles must not be nested inside quantity button styles')
})

test('ordering cart bar is fixed inside the mobile preview width', () => {
  const ordersCreateStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/orders/create.scss'),
    'utf8'
  )
  const cartBarStyle = ordersCreateStyle.match(/\.cart-bar\s*\{[\s\S]*?\n\}/)?.[0] || ''

  assert(cartBarStyle.includes('position: fixed'), 'cart bar must stay visible like the bottom tab bar')
  assert(cartBarStyle.includes('bottom: 50px'), 'cart bar must sit above the bottom tab bar')
  assert(cartBarStyle.includes('max-width: 430px'), 'cart bar must be constrained to the mobile preview width')
  assert(cartBarStyle.includes('left: 50%'), 'cart bar must be centered in the browser viewport')
  assert(cartBarStyle.includes('transform: translateX(-50%)'), 'cart bar must use centering transform instead of browser-wide edges')
  assert(!cartBarStyle.includes('right: 0'), 'cart bar must not pin to browser right edge')
})

test('calendar floating add button stays inside the mobile preview width', () => {
  const calendarContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/calendar/index.tsx'),
    'utf8'
  )
  const calendarStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/calendar/index.scss'),
    'utf8'
  )
  const fabStyle = calendarStyle.match(/\.fab\s*\{[\s\S]*?\n\}/)?.[0] || ''

  assert(calendarContent.includes("Taro.navigateTo({ url: '/pages/calendar/record' })"), 'calendar FAB must open the manual meal record page')
  assert(fabStyle.includes('position: fixed'), 'calendar FAB must remain fixed')
  assert(fabStyle.includes('left: 50%'), 'calendar FAB must anchor from the centered mobile preview')
  assert(fabStyle.includes('margin-left: 151px'), 'calendar FAB must sit near the right edge of the 430px mobile preview')
  assert(!fabStyle.includes('right: 16px'), 'calendar FAB must not pin to the browser right edge')
})

test('floating page actions stay inside the mobile preview width', () => {
  const checks = [
    {
      file: 'fanda-app/src/pages/dishes/index.scss',
      selector: '.fab',
      required: ['position: fixed', 'left: 50%', 'margin-left: 151px'],
      forbidden: ['right: 16px', 'right: 0'],
    },
    {
      file: 'fanda-app/src/pages/dishes/detail.scss',
      selector: '.bottom-actions',
      required: ['position: fixed', 'bottom: 50px', 'left: 50%', 'max-width: 430px', 'transform: translateX(-50%)'],
      forbidden: ['bottom: 0', 'left: 0', 'right: 0'],
    },
    {
      file: 'fanda-app/src/pages/orders/index.scss',
      selector: '.create-btn-wrapper',
      required: ['position: fixed', 'bottom: 50px', 'left: 50%', 'max-width: 430px', 'transform: translateX(-50%)'],
      forbidden: ['bottom: 0', 'left: 0', 'right: 0'],
    },
  ]

  for (const check of checks) {
    const style = fs.readFileSync(path.join(process.cwd(), check.file), 'utf8')
    const block = style.match(new RegExp(`${check.selector.replace('.', '\\.')}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] || ''
    for (const rule of check.required) {
      assert(block.includes(rule), `${check.file} ${check.selector} must include ${rule}`)
    }
    for (const rule of check.forbidden) {
      assert(!block.includes(rule), `${check.file} ${check.selector} must not include ${rule}`)
    }
  }
})

test('calendar page uses compact mobile calendar proportions', () => {
  const calendarStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/calendar/index.scss'),
    'utf8'
  )
  const heroStickerStyle = calendarStyle.match(/\.hero-sticker\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''
  const monthNavStyle = calendarStyle.match(/\.month-nav\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const weekHeaderStyle = calendarStyle.match(/\.week-header\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const calendarCellStyle = calendarStyle.match(/\.calendar-cell\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const todayStyle = calendarStyle.match(/&\.today\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''

  assert(heroStickerStyle.includes('width: 56px'), 'calendar hero sticker must be compact on mobile')
  assert(monthNavStyle.includes('padding: 12px 16px'), 'month navigation must use compact vertical spacing')
  assert(weekHeaderStyle.includes('padding: 6px 10px'), 'week header must not add excessive height')
  assert(calendarCellStyle.includes('min-height: 52px'), 'calendar date cells must fit mobile screens')
  assert(todayStyle.includes('width: 30px'), 'today badge must not force tall calendar cells')
})

test('calendar date record cards stay inside the mobile page width', () => {
  const calendarStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/calendar/index.scss'),
    'utf8'
  )
  const recordsSectionStyle = calendarStyle.match(/\.records-section\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const recordCardStyle = calendarStyle.match(/\.record-card\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const recordBodyStyle = calendarStyle.match(/\.record-body\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''
  const restaurantStyle = calendarStyle.match(/\.record-restaurant\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''

  assert(recordsSectionStyle.includes('width: calc(100% - 48px)'), 'date records section must subtract horizontal page margins from its width')
  assert(recordsSectionStyle.includes('box-sizing: border-box'), 'date records section must include margins inside the mobile width')
  assert(recordsSectionStyle.includes('overflow-x: hidden'), 'date records section must not scroll horizontally')
  assert(recordCardStyle.includes('width: 100%'), 'date record cards must not overflow their section')
  assert(recordCardStyle.includes('box-sizing: border-box'), 'date record cards must include padding and border in their width')
  assert(recordBodyStyle.includes('min-width: 0'), 'date record row must allow text truncation in flex layout')
  assert(restaurantStyle.includes('min-width: 0'), 'date record restaurant text must shrink instead of pushing amount outside')
})

test('home recent orders empty icon renders fully', () => {
  const homeContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/index/index.tsx'),
    'utf8'
  )
  const homeStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/index/index.scss'),
    'utf8'
  )
  const emptyStateStyle = homeStyle.match(/\.empty-state\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const emptyIconWrapStyle = homeStyle.match(/\.empty-icon-wrap\s*\{[\s\S]*?\n\}/)?.[0] || ''
  const emptyOrderIconStyle = homeStyle.match(/\.empty-order-icon\s*\{[\s\S]*?\n\}/)?.[0] || ''

  assert(homeContent.includes("className='empty-state fanda-empty'"), 'home recent orders must use the empty-state block')
  assert(homeContent.includes("className='empty-icon-wrap'"), 'home recent orders empty icon must use a stable wrapper')
  assert(homeContent.includes("className='empty-order-icon'"), 'home recent orders empty icon must avoid Taro Image clipping')
  assert(emptyIconWrapStyle.includes('width: 72px'), 'home empty icon wrapper must reserve full icon width')
  assert(emptyIconWrapStyle.includes('height: 72px'), 'home empty icon wrapper must reserve full icon height')
  assert(emptyIconWrapStyle.includes('overflow: visible'), 'home empty icon wrapper must not clip the sticker')
  assert(emptyOrderIconStyle.includes("background-image: url('../../assets/stickers/order.png')"), 'home empty icon must render as a background image')
  assert(emptyOrderIconStyle.includes('background-size: contain'), 'home empty background icon must show the full sticker')
  assert(emptyOrderIconStyle.includes('background-repeat: no-repeat'), 'home empty background icon must not tile')
  assert(emptyOrderIconStyle.includes('background-position: center'), 'home empty background icon must stay centered')
})

test('login page hides tabbar and renders logo without image clipping', () => {
  const appConfig = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/app.config.ts'),
    'utf8'
  )
  const loginContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/login/index.tsx'),
    'utf8'
  )
  const loginStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/login/index.scss'),
    'utf8'
  )
  const logoIconStyle = loginStyle.match(/\.logo-icon\s*\{[\s\S]*?\n\s*\}/)?.[0] || ''
  const loginHeroStyle = loginStyle.match(/\.login-hero\s*\{[\s\S]*?\n\}/)?.[0] || ''

  assert(!appConfig.match(/tabBar:\s*\{[\s\S]*pagePath:\s*'pages\/login\/index'/), 'login page must not be a tabbar page')
  assert(loginContent.includes('Taro.hideTabBar'), 'login page must explicitly hide tabbar in H5 and mini program runtimes')
  assert(loginContent.includes('Taro.showTabBar'), 'login flow must restore tabbar before entering the main tab page')
  assert(loginContent.includes("className='logo-icon'"), 'login logo must use a stable background container')
  assert(!loginContent.includes("className='logo-icon' src={sticker('home')}"), 'login logo must avoid Taro Image clipping')
  assert(logoIconStyle.includes("background-image: url('../../assets/stickers/home.png')"), 'login logo must render as a background image')
  assert(logoIconStyle.includes('background-size: contain'), 'login logo background must show the full sticker')
  assert(logoIconStyle.includes('background-repeat: no-repeat'), 'login logo background must not tile')
  assert(logoIconStyle.includes('background-position: center'), 'login logo background must stay centered')
  assert(loginHeroStyle.includes('margin-bottom: 88px'), 'login hero must leave enough space before the login button when the tabbar is hidden')
})

test('calendar record page shows a manual meal form when opened without id', () => {
  const recordContent = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/calendar/record.tsx'),
    'utf8'
  )
  const recordStyle = fs.readFileSync(
    path.join(process.cwd(), 'fanda-app/src/pages/calendar/record.scss'),
    'utf8'
  )
  const submitStyle = recordStyle.match(/\.form-submit\s*\{[\s\S]*?\n\}/)?.[0] || ''

  assert(recordContent.includes('isCreateMode'), 'record page must distinguish create mode from detail mode')
  assert(recordContent.includes('补记一餐'), 'record page must show manual meal form title when no id is provided')
  assert(recordContent.includes('calendarAPI.create'), 'record page must create calendar records from the manual form')
  assert(recordContent.includes('loadCreateTables'), 'record page must load available tables for manual records')
  assert(recordContent.includes('record-form'), 'record page must render a form instead of the missing-record empty state')
  assert(submitStyle.includes('width: calc(100% - 48px)'), 'manual record submit button must stay inside the mobile page width')
  assert(submitStyle.includes('box-sizing: border-box'), 'manual record submit button must include its border in the constrained width')
})
