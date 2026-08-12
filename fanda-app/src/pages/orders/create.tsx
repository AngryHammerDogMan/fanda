import { View, Text, ScrollView, Image, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, useMemo } from 'react'
import { dishAPI, orderAPI, tableAPI } from '@/services/api'
import type { Dish, Table, TableMember } from '@/types'
import { getErrorMessage } from '@/utils/error'
import { LAST_ORDER_TABLE_KEY } from '@/utils/table'
import './create.scss'

interface SelectedDish {
  dish: Dish
  quantity: number
}

interface DishCategoryGroup {
  name: string
  anchorId: string
  dishes: Dish[]
}

interface DishScrollEvent {
  detail: {
    scrollTop: number
  }
}

type CheckoutMode = 'solo' | 'together'

const sticker = (name: string) => `/assets/stickers/${name}.png`
const DEFAULT_CATEGORY = '未分类'
const ALL_CATEGORY = '全部'
const CATEGORY_SECTION_TITLE_HEIGHT = 42
const DISH_CARD_SCROLL_HEIGHT = 166

export default function CreateOrder() {
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [dishes, setDishes] = useState<Dish[]>([])
  const [selectedDishes, setSelectedDishes] = useState<SelectedDish[]>([])
  const [keyword, setKeyword] = useState('')
  const [activeCategory, setActiveCategory] = useState('全部')
  const [showTableSheet, setShowTableSheet] = useState(false)
  const [showCheckoutSheet, setShowCheckoutSheet] = useState(false)
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>('solo')
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([])
  const [dishScrollIntoView, setDishScrollIntoView] = useState('')
  const [categoryScrollIntoView, setCategoryScrollIntoView] = useState('')
  const [loadingDishes, setLoadingDishes] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadTables()
  }, [])

  useEffect(() => {
    if (!activeTableId) return
    loadDishes(activeTableId)
  }, [activeTableId])

  const activeTable = tables.find(table => table.id === activeTableId)

  const keywordFilteredDishes = useMemo(() => {
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
        anchorId: `dish-section-${groups.length}`,
        dishes: [dish],
      })
    })
    return groups
  }, [keywordFilteredDishes])

  const categories = useMemo(() => [ALL_CATEGORY, ...dishCategoryGroups.map(group => group.name)], [dishCategoryGroups])

  const totalQuantity = selectedDishes.reduce((sum, item) => sum + item.quantity, 0)

  const totalAmount = selectedDishes.reduce((sum, item) => {
    if (item.dish.price != null) {
      return sum + (item.dish.price * item.quantity)
    }
    return sum
  }, 0)

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
    if (tableId === activeTableId) {
      setShowTableSheet(false)
      return
    }
    setActiveTableId(tableId)
    setSelectedDishes([])
    setKeyword('')
    setActiveCategory(ALL_CATEGORY)
    setDishScrollIntoView('')
    setCategoryScrollIntoView('')
    setShowTableSheet(false)
    Taro.setStorageSync(LAST_ORDER_TABLE_KEY, tableId)
    Taro.showToast({ title: '已切换餐桌，购物车已清空', icon: 'none' })
  }

  const handleCategorySelect = (category: string) => {
    setActiveCategory(category)
    const categoryIndex = categories.findIndex(item => item === category)
    setCategoryScrollIntoView(`category-item-${Math.max(categoryIndex, 0)}`)
    if (category === ALL_CATEGORY) {
      setDishScrollIntoView('dish-list-top')
      return
    }
    const targetGroup = dishCategoryGroups.find(group => group.name === category)
    setDishScrollIntoView(targetGroup?.anchorId || 'dish-list-top')
  }

  const handleDishScroll = (event: DishScrollEvent) => {
    if (dishCategoryGroups.length === 0) return
    const scrollTop = event.detail.scrollTop
    if (scrollTop < CATEGORY_SECTION_TITLE_HEIGHT) {
      if (activeCategory !== ALL_CATEGORY) setActiveCategory(ALL_CATEGORY)
      setCategoryScrollIntoView('category-item-0')
      return
    }

    let nextActiveCategory = dishCategoryGroups[0].name
    let accumulatedHeight = 0
    dishCategoryGroups.forEach(group => {
      const sectionHeight = CATEGORY_SECTION_TITLE_HEIGHT + group.dishes.length * DISH_CARD_SCROLL_HEIGHT
      if (scrollTop + CATEGORY_SECTION_TITLE_HEIGHT >= accumulatedHeight) {
        nextActiveCategory = group.name
      }
      accumulatedHeight += sectionHeight
    })
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
            ? { ...item, quantity: Math.min(99, item.quantity + 1) }
            : item
        )
      }
      return [...prev, { dish, quantity: 1 }]
    })
  }

  const handleQuantityChange = (dishId: string, delta: number) => {
    setSelectedDishes(prev => {
      const next = prev.map(item => {
        if (item.dish.id === dishId) {
          return { ...item, quantity: Math.max(0, Math.min(99, item.quantity + delta)) }
        }
        return item
      })
      return next.filter(item => item.quantity > 0)
    })
  }

  const getInvitableMembers = (): TableMember[] => {
    const table = tables.find(item => item.id === activeTableId)
    if (!table) return []
    const currentUid = Taro.getStorageSync('uid')
    return table.members.filter(member => member.user_id !== currentUid)
  }

  const handleCheckoutClick = () => {
    if (selectedDishes.length === 0) {
      Taro.showToast({ title: '请先选择菜品', icon: 'none' })
      return
    }
    const members = getInvitableMembers()
    if (members.length === 0) {
      submitOrder('solo', [])
      return
    }
    setCheckoutMode('solo')
    setSelectedParticipantIds(members.map(member => member.user_id))
    setShowCheckoutSheet(true)
  }

  const submitOrder = async (mode: CheckoutMode, participantIds: string[]) => {
    if (!activeTableId || submitting) return
    if (mode === 'together' && participantIds.length === 0) {
      Taro.showToast({ title: '请选择一起吃的成员', icon: 'none' })
      return
    }
    if (selectedDishes.length === 0) {
      Taro.showToast({ title: '请先选择菜品', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await orderAPI.create({
        table_id: activeTableId,
        dine_mode: mode,
        participant_ids: mode === 'together' ? participantIds : [],
        order_items: selectedDishes.map(item => ({
          dish_id: item.dish.id,
          quantity: item.quantity,
          unit_price: item.dish.price,
        })),
      })
      setSelectedDishes([])
      setShowCheckoutSheet(false)
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
          scrollIntoView={dishScrollIntoView}
          onScroll={handleDishScroll}
        >
          <View id='dish-list-top' />
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
                <View id={group.anchorId} key={group.name} className='dish-section'>
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
                              <View className='quantity-control'>
                                <View className='qty-btn' onClick={() => handleQuantityChange(dish.id, -1)}>-</View>
                                <Text className='qty-value'>{selected.quantity}</Text>
                                <View className='qty-btn plus' onClick={() => handleQuantityChange(dish.id, 1)}>+</View>
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
          <View
            className={`checkout-btn ${selectedDishes.length === 0 || submitting ? 'disabled' : ''}`}
            onClick={selectedDishes.length === 0 || submitting ? undefined : handleCheckoutClick}
          >
            {submitting ? '下单中...' : '去下单'}
          </View>
        </View>
      </View>

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
            <View className='sheet-title'>这单怎么吃？</View>
            <View className='checkout-mode-row'>
              <View
                className={`checkout-mode ${checkoutMode === 'solo' ? 'active' : ''}`}
                onClick={() => setCheckoutMode('solo')}
              >
                <Text className='mode-title'>单人下单</Text>
                <Text className='mode-desc'>只记录我自己</Text>
              </View>
              <View
                className={`checkout-mode ${checkoutMode === 'together' ? 'active' : ''}`}
                onClick={() => setCheckoutMode('together')}
              >
                <Text className='mode-title'>邀请一起吃</Text>
                <Text className='mode-desc'>发送给餐桌成员</Text>
              </View>
            </View>
            {checkoutMode === 'together' && (
              <View className='member-list'>
                {getInvitableMembers().map((member, index) => (
                  <View
                    key={member.id}
                    className={`member-option ${selectedParticipantIds.includes(member.user_id) ? 'active' : ''}`}
                    onClick={() => toggleParticipant(member.user_id)}
                  >
                    <Text>{getMemberLabel(member, index)}</Text>
                    <Text className='member-status'>{selectedParticipantIds.includes(member.user_id) ? '已选择' : '可邀请'}</Text>
                  </View>
                ))}
              </View>
            )}
            <View
              className={`sheet-submit ${submitting ? 'disabled' : ''}`}
              onClick={() => submitOrder(checkoutMode, checkoutMode === 'together' ? selectedParticipantIds : [])}
            >
              {submitting ? '提交中...' : checkoutMode === 'together' ? '邀请并下单' : '单人直接下单'}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
