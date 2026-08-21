import { View, Text, ScrollView, Image, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { dishAPI, orderAPI, tableAPI } from '@/services/api'
import type { Dish, Table, TableMember } from '@/types'
import { getErrorMessage } from '@/utils/error'
import { getDefaultConfirmedAmount, parseAmountInput, sumNullableAmounts, validateAmountInput } from '@/utils/amount'
import { LAST_ORDER_TABLE_KEY } from '@/utils/table'
import './create.scss'

interface SelectedDish {
  dish: Dish
  quantity: number
  confirmedAmount: string
  amountTouched: boolean
}

interface DishCategoryGroup {
  name: string
  dishes: Dish[]
}

interface DishScrollEvent {
  detail: {
    scrollTop: number
  }
}

interface PurchaseCandidate {
  key: string
  name: string
  quantity: string
  sourceDishName: string
}

const sticker = (name: string) => `/assets/stickers/${name}.png`
const DEFAULT_CATEGORY = '未分类'
const ALL_CATEGORY = '全部'
const CATEGORY_SECTION_TITLE_HEIGHT = 42

// 点单创建页：按餐桌选择菜品、维护购物车、邀请成员并提交订单。
export default function CreateOrder() {
  // 餐桌、菜品、购物车、筛选词、弹层和提交态共同驱动本页点单流程。
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [dishes, setDishes] = useState<Dish[]>([])
  const [selectedDishes, setSelectedDishes] = useState<SelectedDish[]>([])
  const [keyword, setKeyword] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [showTableSheet, setShowTableSheet] = useState(false)
  const [showCheckoutSheet, setShowCheckoutSheet] = useState(false)
  const [showCartSheet, setShowCartSheet] = useState(false)
  const [needInvite, setNeedInvite] = useState(false)
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [needPurchase, setNeedPurchase] = useState(false)
  const [selectedPurchaseKeys, setSelectedPurchaseKeys] = useState<string[]>([])
  const [dishScrollTop, setDishScrollTop] = useState(0)
  const [categoryScrollIntoView, setCategoryScrollIntoView] = useState('')
  const [loadingDishes, setLoadingDishes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // 滚动联动状态：区分点击分类触发的滚动和用户手势滚动，避免左右导航互相抢焦点。
  const scrollingByClick = useRef(false)
  const scrollLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sectionPositionsRef = useRef<{ name: string; top: number }[]>([])
  const latestScrollTopRef = useRef(0)
  const measureTokenRef = useRef(0)
  const measuringRef = useRef(false)

  useEffect(() => {
    const chooseInitialTable = (list: Table[]): string => {
      const lastTableId = Taro.getStorageSync(LAST_ORDER_TABLE_KEY)
      if (typeof lastTableId === 'string' && list.some(table => table.id === lastTableId)) {
        return lastTableId
      }
      const primary = list.find(table => table.type === 'personal' || table.type === 'couple')
      return primary?.id || list[0]?.id || ''
    }

    const loadTables = async () => {
      try {
        const res = await tableAPI.list()
        const list = res.data || []
        setTables(list)
        const nextTableId = chooseInitialTable(list)
        setActiveTableId(nextTableId)
        if (nextTableId) Taro.setStorageSync(LAST_ORDER_TABLE_KEY, nextTableId)
      } catch (err: unknown) {
        Taro.showToast({ title: getErrorMessage(err, '加载餐桌失败'), icon: 'none' })
      }
    }

    loadTables()
  }, [])

  useEffect(() => {
    if (!activeTableId) return
    loadDishes(activeTableId)
  }, [activeTableId])

  const activeTable = tables.find(table => table.id === activeTableId)

  const keywordFilteredDishes = useMemo(() => {
    // 搜索只在本地菜品列表中筛选，不触发额外网络请求。
    const normalizedKeyword = keyword.trim().toLowerCase()
    return dishes.filter(dish => {
      const matchesKeyword = !normalizedKeyword
        || dish.name.toLowerCase().includes(normalizedKeyword)
        || dish.category.toLowerCase().includes(normalizedKeyword)
        || dish.restaurant.toLowerCase().includes(normalizedKeyword)
      return matchesKeyword
    })
  }, [dishes, keyword])

  const dishCategoryGroups = useMemo<DishCategoryGroup[]>(() => {
    const groups: DishCategoryGroup[] = []
    keywordFilteredDishes.forEach(dish => {
      const categoryName = dish.category?.trim() || DEFAULT_CATEGORY
      const existingGroup = groups.find(group => group.name === categoryName)
      if (existingGroup) {
        existingGroup.dishes.push(dish)
        return
      }
      groups.push({
        name: categoryName,
        dishes: [dish],
      })
    })
    return groups
  }, [keywordFilteredDishes])

  const categories = useMemo(() => [ALL_CATEGORY, ...dishCategoryGroups.map(group => group.name)], [dishCategoryGroups])

  // 实测各分类区块在滚动容器中的位置，避免用估算高度导致左右联动错位
  const measureSectionPositions = useCallback(() => {
    const token = ++measureTokenRef.current
    const query = Taro.createSelectorQuery()
    query.selectAll('.dish-section').boundingClientRect()
    query.select('.dish-scroll').boundingClientRect()
    query.select('.dish-scroll').scrollOffset()
    query.exec(res => {
      if (token !== measureTokenRef.current) return
      const sectionRects = res?.[0] as Array<{ top: number }> | undefined
      const scrollRect = res?.[1] as { top: number } | undefined
      const scrollOffset = res?.[2] as { scrollTop: number } | undefined
      // 渲染未完成时区块数对不上，视为本次测量失败，等滚动时补测
      if (!scrollRect || !Array.isArray(sectionRects) || sectionRects.length !== dishCategoryGroups.length) {
        return
      }
      const scrollTop = scrollOffset?.scrollTop ?? latestScrollTopRef.current
      sectionPositionsRef.current = sectionRects.map((rect, index) => ({
        name: dishCategoryGroups[index]?.name || '',
        top: rect.top - scrollRect.top + scrollTop,
      }))
    })
  }, [dishCategoryGroups])

  useEffect(() => {
    sectionPositionsRef.current = []
    if (dishCategoryGroups.length === 0) return
    Taro.nextTick(measureSectionPositions)
  }, [dishCategoryGroups, measureSectionPositions])

  const totalQuantity = selectedDishes.reduce((sum, item) => sum + item.quantity, 0)

  const totalAmount = selectedDishes.reduce((sum, item) => {
    if (item.dish.price != null) {
      return sum + (item.dish.price * item.quantity)
    }
    return sum
  }, 0)
  const hasInvalidConfirmedAmount = selectedDishes.some(item => validateAmountInput(item.confirmedAmount))
  const confirmedTotal = sumNullableAmounts(
    selectedDishes.map(item => validateAmountInput(item.confirmedAmount) == null
      ? parseAmountInput(item.confirmedAmount)
      : null)
  )

  const purchaseCandidates = useMemo<PurchaseCandidate[]>(() => {
    const candidateMap = new Map<string, PurchaseCandidate>()
    selectedDishes.forEach(selected => {
      selected.dish.ingredients?.forEach(ingredient => {
        const name = ingredient.name.trim()
        if (!name) return
        const quantity = ingredient.amount?.trim() || '适量'
        const key = `${name}-${quantity}`
        if (candidateMap.has(key)) return
        candidateMap.set(key, {
          key,
          name,
          quantity,
          sourceDishName: selected.dish.name,
        })
      })
    })
    return Array.from(candidateMap.values())
  }, [selectedDishes])

  const loadDishes = async (tableId: string) => {
    setLoadingDishes(true)
    try {
      const res = await dishAPI.list({
        table_id: tableId,
        page: 1,
        page_size: 200,
      })
      setDishes(res.data?.list || [])
      setActiveCategory('全部')
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '加载菜品失败'), icon: 'none' })
    } finally {
      setLoadingDishes(false)
    }
  }

  const handleSwitchTable = (tableId: string) => {
    // 切换餐桌会改变可选菜品和成员范围，因此同步清空购物车、筛选和弹层状态。
    if (tableId === activeTableId) {
      setShowTableSheet(false)
      return
    }
    setActiveTableId(tableId)
    setSelectedDishes([])
    setNeedPurchase(false)
    setSelectedPurchaseKeys([])
    setShowCartSheet(false)
    setKeyword('')
    setActiveCategory(ALL_CATEGORY)
    setDishScrollTop(0)
    setCategoryScrollIntoView('')
    setShowTableSheet(false)
    Taro.setStorageSync(LAST_ORDER_TABLE_KEY, tableId)
    Taro.showToast({ title: '已切换餐桌，购物车已清空', icon: 'none' })
  }

  const handleCategorySelect = (category: string) => {
    // 点击左侧分类时锁住滚动联动，避免程序滚动又反向触发分类高亮抖动。
    setActiveCategory(category)
    const categoryIndex = categories.findIndex(item => item === category)
    setCategoryScrollIntoView(`category-item-${Math.max(categoryIndex, 0)}`)
    scrollingByClick.current = true
    if (scrollLockTimer.current) clearTimeout(scrollLockTimer.current)
    scrollLockTimer.current = setTimeout(() => { scrollingByClick.current = false }, 500)
    if (category === ALL_CATEGORY) {
      setDishScrollTop(0)
      return
    }
    const sectionPositions = sectionPositionsRef.current
    const targetPosition = sectionPositions.find(p => p.name === category)
    if (targetPosition) {
      setDishScrollTop(targetPosition.top)
    }
  }

  const handleDishScroll = (event: DishScrollEvent) => {
    // 用户滚动菜品列表时，根据实际区块位置反推当前分类。
    latestScrollTopRef.current = event.detail.scrollTop
    if (scrollingByClick.current) return
    setDishScrollTop(event.detail.scrollTop)
    if (dishCategoryGroups.length === 0) return
    const sectionPositions = sectionPositionsRef.current
    // 位置还没测好（或列表刚变化）时先补测，下一次滚动事件再联动
    if (sectionPositions.length !== dishCategoryGroups.length) {
      if (!measuringRef.current) {
        measuringRef.current = true
        measureSectionPositions()
      }
      return
    }
    measuringRef.current = false
    const scrollTop = latestScrollTopRef.current
    const triggerLine = scrollTop + CATEGORY_SECTION_TITLE_HEIGHT
    let nextActiveCategory: string
    if (triggerLine < sectionPositions[0].top) {
      nextActiveCategory = ALL_CATEGORY
    } else {
      nextActiveCategory = sectionPositions[sectionPositions.length - 1].name
      for (const position of sectionPositions) {
        if (triggerLine >= position.top) {
          nextActiveCategory = position.name
        } else {
          break
        }
      }
    }
    if (nextActiveCategory !== activeCategory) {
      setActiveCategory(nextActiveCategory)
      const categoryIndex = categories.findIndex(item => item === nextActiveCategory)
      setCategoryScrollIntoView(`category-item-${Math.max(categoryIndex, 0)}`)
    }
  }

  const handleAddDish = (dish: Dish) => {
    setSelectedDishes(prev => {
      const existing = prev.find(item => item.dish.id === dish.id)
      if (existing) {
        return prev.map(item =>
          item.dish.id === dish.id
            ? (() => {
              const quantity = Math.min(99, item.quantity + 1)
              return {
                ...item,
                quantity,
                confirmedAmount: item.amountTouched
                  ? item.confirmedAmount
                  : getDefaultConfirmedAmount(item.dish.price, quantity),
              }
            })()
            : item
        )
      }
      return [...prev, {
        dish,
        quantity: 1,
        confirmedAmount: getDefaultConfirmedAmount(dish.price, 1),
        amountTouched: false,
      }]
    })
  }

  const handleQuantityChange = (dishId: string, delta: number) => {
    setSelectedDishes(prev => {
      const next = prev.map(item => {
        if (item.dish.id === dishId) {
          const quantity = Math.max(0, Math.min(99, item.quantity + delta))
          return {
            ...item,
            quantity,
            confirmedAmount: item.amountTouched
              ? item.confirmedAmount
              : getDefaultConfirmedAmount(item.dish.price, quantity),
          }
        }
        return item
      })
      return next.filter(item => item.quantity > 0)
    })
  }

  const handleConfirmedAmountChange = (dishId: string, value: string) => {
    setSelectedDishes(prev => prev.map(item => (
      item.dish.id === dishId
        ? { ...item, confirmedAmount: value, amountTouched: true }
        : item
    )))
  }

  const handleDishListQuantityClick = (
    event: { stopPropagation: () => void },
    dishId: string,
    delta: number
  ) => {
    event.stopPropagation()
    handleQuantityChange(dishId, delta)
  }

  const getInvitableMembers = (): TableMember[] => {
    const table = tables.find(item => item.id === activeTableId)
    if (!table) return []
    const currentUid = Taro.getStorageSync('uid')
    return table.members.filter(member => member.user_id !== currentUid)
  }

  const handleCheckoutClick = () => {
    // 结算前根据餐桌成员预填邀请对象，并重置采购清单确认状态。
    if (selectedDishes.length === 0) {
      Taro.showToast({ title: '请先选择菜品', icon: 'none' })
      return
    }
    const members = getInvitableMembers()
    setNeedInvite(members.length > 0)
    setSelectedParticipantIds(members.map(member => member.user_id))
    setNeedPurchase(false)
    setSelectedPurchaseKeys([])
    setShowCheckoutSheet(true)
  }

  const handleClearCart = () => {
    setSelectedDishes([])
    setShowCartSheet(false)
    setNeedPurchase(false)
    setSelectedPurchaseKeys([])
  }

  const submitOrder = async () => {
    // 提交时统一组装订单菜品、成员邀请和需要采购的食材，成功后回到订单列表。
    if (!activeTableId || submitting) return
    const canInviteMembers = getInvitableMembers()
    const shouldInvite = needInvite && canInviteMembers.length > 0
    const participantIds = shouldInvite ? selectedParticipantIds : []
    if (shouldInvite && participantIds.length === 0) {
      Taro.showToast({ title: '请选择一起吃的成员', icon: 'none' })
      return
    }
    if (selectedDishes.length === 0) {
      Taro.showToast({ title: '请先选择菜品', icon: 'none' })
      return
    }
    const invalidItem = selectedDishes.find(item => validateAmountInput(item.confirmedAmount))
    if (invalidItem) {
      Taro.showToast({
        title: `${invalidItem.dish.name}：${validateAmountInput(invalidItem.confirmedAmount)}`,
        icon: 'none',
      })
      return
    }
    setSubmitting(true)
    try {
      await orderAPI.create({
        table_id: activeTableId,
        dine_mode: shouldInvite ? 'together' : 'solo',
        participant_ids: participantIds,
        items: selectedDishes.map(item => ({
          dish_id: item.dish.id,
          quantity: item.quantity,
          confirmed_amount: parseAmountInput(item.confirmedAmount),
        })),
        basket_items: needPurchase
          ? purchaseCandidates
            .filter(item => selectedPurchaseKeys.includes(item.key))
            .map(item => ({ name: item.name, quantity: item.quantity }))
          : [],
      })
      setSelectedDishes([])
      setShowCheckoutSheet(false)
      setNeedPurchase(false)
      setSelectedPurchaseKeys([])
      Taro.showToast({ title: '下单成功', icon: 'success' })
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '下单失败'), icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const toggleParticipant = (userId: string) => {
    setSelectedParticipantIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    )
  }

  const toggleNeedInvite = () => {
    const members = getInvitableMembers()
    setNeedInvite(prev => {
      if (prev) {
        setSelectedParticipantIds([])
        return false
      }
      setSelectedParticipantIds(members.map(member => member.user_id))
      return members.length > 0
    })
  }

  const toggleNeedPurchase = () => {
    setNeedPurchase(prev => {
      if (prev) {
        setSelectedPurchaseKeys([])
        return false
      }
      setSelectedPurchaseKeys(purchaseCandidates.map(item => item.key))
      return true
    })
  }

  const togglePurchaseCandidate = (key: string) => {
    setSelectedPurchaseKeys(prev =>
      prev.includes(key)
        ? prev.filter(item => item !== key)
        : [...prev, key]
    )
  }

  const getTableTypeText = (table: Table) => {
    if (table.type === 'personal') return '个人'
    if (table.type === 'couple') return '情侣'
    return '饭搭'
  }

  const getDishTypeText = (dish: Dish) => {
    if (dish.dish_type === 'takeout') return '外卖'
    if (dish.dish_type === 'dineout') return '外食'
    return '自做'
  }

  const getMemberLabel = (member: TableMember, index: number) => {
    if (member.role === 'owner') return '桌主'
    return `成员 ${index + 1}`
  }

  return (
    <View className='page-create-order'>
      <View className='order-header'>
        <View className='order-table-strip' onClick={() => setShowTableSheet(true)}>
          <View className='table-info'>
            <Text className='table-label'>当前餐桌</Text>
            <Text className='table-name'>{activeTable?.name || '选择餐桌'}</Text>
            <Text className='table-note'>
              {activeTable ? `${dishes.length} 道可点 · ${activeTable.members.length} 人餐桌` : '选择餐桌后开始点单'}
            </Text>
          </View>
          <Text className='table-switch'>切换</Text>
        </View>
      </View>

      <View className='search-bar order-search-soft'>
        <Text className='search-icon'>⌕</Text>
        <Input
          className='search-input'
          value={keyword}
          placeholder='搜索菜品、分类或餐厅'
          onInput={event => setKeyword(event.detail.value)}
        />
      </View>

      <View className='order-menu-panel'>
        <ScrollView className='category-sidebar' scrollY scrollIntoView={categoryScrollIntoView}>
          {categories.map((category, index) => (
            <View
              id={`category-item-${index}`}
              key={category}
              className={`category-item ${activeCategory === category ? 'active' : ''}`}
              onClick={() => handleCategorySelect(category)}
            >
              <Text>{category}</Text>
            </View>
          ))}
          <View className='category-bottom-space' />
        </ScrollView>

        <ScrollView
          className='dish-scroll'
          scrollY
          scrollTop={dishScrollTop}
          onScroll={handleDishScroll}
        >
          {loadingDishes ? (
            <View className='state-card'>加载菜品中...</View>
          ) : !activeTableId ? (
            <View className='state-card'>
              <Image className='state-icon' src={sticker('menu-muted')} mode='aspectFit' />
              <Text>暂无可用餐桌，请先在我的页面创建关系</Text>
            </View>
          ) : dishCategoryGroups.length === 0 ? (
            <View className='state-card'>
              <Image className='state-icon' src={sticker('basket-muted')} mode='aspectFit' />
              <Text>{dishes.length === 0 ? '当前餐桌还没有菜品' : '没有匹配的菜品'}</Text>
            </View>
          ) : (
            <View className='dish-list'>
              {dishCategoryGroups.map(group => (
                <View key={group.name} className='dish-section'>
                  <View className='dish-section-title'>
                    <Text>{group.name}</Text>
                    <Text className='dish-section-count'>{group.dishes.length} 道</Text>
                  </View>
                  {group.dishes.map(dish => {
                    const selected = selectedDishes.find(item => item.dish.id === dish.id)
                    return (
                      <View key={dish.id} className={`dish-row ${selected ? 'selected' : ''}`}>
                        <View className='dish-row-thumb'>
                          <Image className='dish-row-sticker' src={sticker(dish.dish_type === 'takeout' ? 'order' : 'menu')} mode='aspectFit' />
                        </View>
                        <View className='dish-row-main'>
                          <View className='dish-title-row'>
                            <Text className='dish-name'>{dish.name}</Text>
                            <Text className='dish-type'>{getDishTypeText(dish)}</Text>
                          </View>
                          <Text className='dish-desc'>
                            {dish.restaurant || dish.restaurant_note || dish.tags?.join(' · ') || '餐桌常备菜单'}
                          </Text>
                          <View className='dish-meta'>
                            {dish.duration ? <Text className='dish-category'>{dish.duration} 分钟</Text> : null}
                          </View>
                          <View className='dish-bottom'>
                            <Text className='dish-price'>
                              {dish.price != null ? `¥${dish.price.toFixed(2)}` : '待估价'}
                            </Text>
                            {selected ? (
                              <View className='quantity-control dish-list-quantity-control'>
                                <View className='qty-btn minus' onClick={(event) => handleDishListQuantityClick(event, dish.id, -1)}>-</View>
                                <Text className='qty-value'>{selected.quantity}</Text>
                                <View className='qty-btn plus' onClick={(event) => handleDishListQuantityClick(event, dish.id, 1)}>+</View>
                              </View>
                            ) : (
                              <View className='add-btn' onClick={() => handleAddDish(dish)}>加入</View>
                            )}
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </View>
              ))}
              <View className='bottom-placeholder' />
            </View>
          )}
        </ScrollView>
      </View>

      <View className='cart-bar'>
        {selectedDishes.length > 0 && (
          <ScrollView className='cart-items' scrollX>
            {selectedDishes.map(item => (
              <View key={item.dish.id} className='cart-chip'>
                {item.dish.name} × {item.quantity}
              </View>
            ))}
          </ScrollView>
        )}
        <View className='cart-main'>
          <View
            className='cart-open-area'
            onClick={() => selectedDishes.length > 0 && setShowCartSheet(true)}
          >
            <View className='cart-icon-wrap'>
              <Image className='cart-icon' src={sticker(selectedDishes.length > 0 ? 'basket' : 'basket-muted')} mode='aspectFit' />
              {totalQuantity > 0 && <Text className='cart-badge'>{totalQuantity}</Text>}
            </View>
            <View className='cart-summary'>
              <Text className='cart-title'>购物车</Text>
              <Text className='cart-amount'>
                {totalAmount > 0 ? `¥${totalAmount.toFixed(2)}` : '还没有选择菜品'}
              </Text>
            </View>
          </View>
          <View
            className={`checkout-btn ${selectedDishes.length === 0 || submitting ? 'disabled' : ''}`}
            onClick={selectedDishes.length === 0 || submitting ? undefined : handleCheckoutClick}
          >
            {submitting ? '下单中...' : '去下单'}
          </View>
        </View>
      </View>

      {showCartSheet && (
        <View className='sheet-mask' onClick={() => setShowCartSheet(false)}>
          <View className='sheet-panel cart-detail-sheet' onClick={event => event.stopPropagation()}>
            <View className='sheet-title-row'>
              <View>
                <View className='sheet-title'>购物车明细</View>
                <View className='sheet-desc'>数量减到 0 会自动移除菜品</View>
              </View>
              <View className='clear-cart-btn' onClick={handleClearCart}>清空</View>
            </View>
            {selectedDishes.map(item => (
              <View key={item.dish.id} className='cart-detail-row'>
                <View className='cart-detail-info'>
                  <Text className='cart-detail-name'>{item.dish.name}</Text>
                  <Text className='cart-detail-meta'>
                    {item.dish.price != null ? `¥${item.dish.price.toFixed(2)}` : '待估价'}
                  </Text>
                </View>
                <View className='quantity-control'>
                  <View className='qty-btn' onClick={() => handleQuantityChange(item.dish.id, -1)}>-</View>
                  <Text className='qty-value'>{item.quantity}</Text>
                  <View className='qty-btn plus' onClick={() => handleQuantityChange(item.dish.id, 1)}>+</View>
                </View>
              </View>
            ))}
            <View
              className='sheet-submit cart-submit'
              onClick={() => {
                setShowCartSheet(false)
                handleCheckoutClick()
              }}
            >
              去下单 · {totalAmount > 0 ? `¥${totalAmount.toFixed(2)}` : '待估价'}
            </View>
          </View>
        </View>
      )}

      {showTableSheet && (
        <View className='sheet-mask' onClick={() => setShowTableSheet(false)}>
          <View className='sheet-panel' onClick={event => event.stopPropagation()}>
            <View className='sheet-title'>切换餐桌</View>
            <View className='sheet-desc'>切换后会清空当前购物车</View>
            {tables.map(table => (
              <View
                key={table.id}
                className={`table-option ${activeTableId === table.id ? 'active' : ''}`}
                onClick={() => handleSwitchTable(table.id)}
              >
                <View>
                  <Text className='table-option-name'>{table.name}</Text>
                  <Text className='table-option-meta'>{getTableTypeText(table)} · {table.members.length} 人</Text>
                </View>
                {activeTableId === table.id && <Text className='table-current'>当前</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      {showCheckoutSheet && (
        <View className='sheet-mask' onClick={() => setShowCheckoutSheet(false)}>
          <View className='sheet-panel checkout-sheet' onClick={event => event.stopPropagation()}>
            {(() => {
              const canInviteMembers = getInvitableMembers()
              return (
                <>
            <View className='sheet-title'>确认本餐</View>
            <View className='sheet-desc'>
              {activeTable?.name || '当前餐桌'} · 已选 {totalQuantity} 道 · {totalAmount > 0 ? `¥${totalAmount.toFixed(2)}` : '待估价'}
            </View>
            <View className='confirm-section'>
              <View className='confirm-section-head'>
                <Text>已选菜品</Text>
                <Text className='confirm-section-note'>可返回调整</Text>
              </View>
              {selectedDishes.map(item => (
                <View key={item.dish.id} className='confirm-dish-row'>
                  <View className='confirm-dish-info'>
                    <Text>{item.dish.name} × {item.quantity}</Text>
                    <Text className='confirm-reference'>
                      参考单价 {item.dish.price == null ? '待填写' : `¥${item.dish.price.toFixed(2)}`}
                    </Text>
                  </View>
                  <View className='confirm-amount-field'>
                    <Text className='confirm-amount-label'>本次确认金额</Text>
                    <Input
                      className='confirm-amount-input'
                      type='digit'
                      value={item.confirmedAmount}
                      placeholder='待填写'
                      onInput={event => handleConfirmedAmountChange(item.dish.id, event.detail.value)}
                    />
                  </View>
                </View>
              ))}
              <View className='confirm-total-row'>
                <Text className='confirm-total-label'>本餐总金额</Text>
                <Text className='confirm-total-value'>
                  {hasInvalidConfirmedAmount ? '金额格式有误' : confirmedTotal == null ? '待填写' : `¥${confirmedTotal.toFixed(2)}`}
                </Text>
              </View>
            </View>
            <View className='confirm-section'>
              <View className='confirm-section-head'>
                <Text>菜篮子</Text>
                <Text className='confirm-section-note'>默认不采购</Text>
              </View>
              <View className='purchase-switch' onClick={toggleNeedPurchase}>
                <View>
                  <Text className='purchase-title'>需要采购</Text>
                  <Text className='purchase-desc'>开启后从本餐食材里勾选要买的</Text>
                </View>
                <View className={`switch-pill ${needPurchase ? 'on' : ''}`}>
                  <View className='switch-dot' />
                </View>
              </View>
              {needPurchase && (
                purchaseCandidates.length > 0 ? (
                  <View className='purchase-list'>
                    {purchaseCandidates.map(item => (
                      <View
                        key={item.key}
                        className={`purchase-item ${selectedPurchaseKeys.includes(item.key) ? 'active' : ''}`}
                        onClick={() => togglePurchaseCandidate(item.key)}
                      >
                        <View>
                          <Text className='purchase-name'>{item.name}</Text>
                          <Text className='purchase-source'>来自 {item.sourceDishName}</Text>
                        </View>
                        <Text className='purchase-quantity'>{item.quantity}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View className='purchase-empty'>已选菜品暂未填写食材，确认后不会同步菜篮子</View>
                )
              )}
            </View>
            {canInviteMembers.length > 0 && (
              <View className='confirm-section invite-section'>
                <View className='confirm-section-head'>
                  <Text>邀请</Text>
                  <Text className='confirm-section-note'>默认邀请全部成员</Text>
                </View>
                <View className='invite-switch' onClick={toggleNeedInvite}>
                  <View>
                    <Text className='invite-title'>邀请一起吃</Text>
                    <Text className='invite-desc'>关闭后就是本次只记录自己</Text>
                  </View>
                  <View className={`switch-pill ${needInvite ? 'on' : ''}`}>
                    <View className='switch-dot' />
                  </View>
                </View>
                {needInvite && (
                  <View className='member-list invite-member-list'>
                    {canInviteMembers.map((member, index) => (
                      <View
                        key={member.id}
                        className={`member-option ${selectedParticipantIds.includes(member.user_id) ? 'active' : ''}`}
                        onClick={() => toggleParticipant(member.user_id)}
                      >
                        <Text>{getMemberLabel(member, index)}</Text>
                        <Text className='member-status'>{selectedParticipantIds.includes(member.user_id) ? '已勾选' : '可邀请'}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
            <View
              className={`sheet-submit ${submitting ? 'disabled' : ''}`}
              onClick={submitOrder}
            >
              {submitting ? '提交中...' : needInvite && canInviteMembers.length > 0 ? '确认下单 · 邀请一起吃' : needPurchase && selectedPurchaseKeys.length > 0 ? '确认下单 · 同步到菜篮子' : '确认下单'}
            </View>
                </>
              )
            })()}
          </View>
        </View>
      )}
    </View>
  )
}
