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

  assert(ordersCreateContent.includes('showCartSheet'), 'orders/create must keep cart detail sheet state')
  assert(ordersCreateContent.includes('cart-detail-sheet'), 'orders/create must render a cart detail sheet')
  assert(ordersCreateContent.includes('handleClearCart'), 'orders/create must support clearing the cart')
  assert(ordersCreateContent.includes('购物车明细'), 'orders/create must label the cart detail sheet')
  assert(ordersCreateContent.includes("handleQuantityChange(item.dish.id, -1)"), 'cart detail must allow quantity decrease and removal')
})
