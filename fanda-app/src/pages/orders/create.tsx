import { View, Text, ScrollView, Input, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { authAPI, dishAPI, orderAPI } from '@/services/api'
import type { User, Dish, BuddyGroup, CoupleInfo } from '@/types'
import './create.scss'

interface SelectedDish {
  dish: Dish
  quantity: number
}

const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function CreateOrder() {
  const [user, setUser] = useState<User | null>(null)
  const [groupType, setGroupType] = useState<string>('')
  const [groups, setGroups] = useState<(BuddyGroup | CoupleInfo)[]>([])
  const [groupId, setGroupId] = useState('')
  const [dineMode, setDineMode] = useState<string>('')
  const [dishes, setDishes] = useState<Dish[]>([])
  const [selectedDishes, setSelectedDishes] = useState<SelectedDish[]>([])
  const [loadingDishes, setLoadingDishes] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  // 当群组类型变化时，更新可选群组列表
  useEffect(() => {
    if (!user || !groupType) return
    if (groupType === 'couple' && user.couple) {
      setGroups([user.couple])
    } else if (groupType === 'buddy' && user.buddy_groups) {
      setGroups(user.buddy_groups)
    } else {
      setGroups([])
    }
    setGroupId('')
    setDishes([])
    setSelectedDishes([])
  }, [groupType, user])

  // 当群组 ID 变化时，加载菜品
  useEffect(() => {
    if (!groupId || !groupType) return
    loadDishes()
  }, [groupId, groupType])

  const loadProfile = async () => {
    try {
      const res = await authAPI.getProfile()
      setUser(res.data)
    } catch (err) {
      console.error('加载用户信息失败', err)
      Taro.showToast({ title: '加载用户信息失败', icon: 'none' })
    }
  }

  const loadDishes = async () => {
    if (!groupType || !groupId) return
    setLoadingDishes(true)
    try {
      const res = await dishAPI.list({
        group_type: groupType,
        group_id: groupId,
        page: 1,
        page_size: 200,
      })
      const dishList = res.data?.list || res.data || []
      setDishes(Array.isArray(dishList) ? dishList : [])
    } catch (err) {
      console.error('加载菜品失败', err)
      Taro.showToast({ title: '加载菜品失败', icon: 'none' })
    } finally {
      setLoadingDishes(false)
    }
  }

  // 选择菜品
  const handleSelectDish = (dish: Dish) => {
    setSelectedDishes(prev => {
      const existing = prev.find(item => item.dish.id === dish.id)
      if (existing) {
        return prev.filter(item => item.dish.id !== dish.id)
      }
      return [...prev, { dish, quantity: 1 }]
    })
  }

  // 更新数量
  const handleQuantityChange = (dishId: string, delta: number) => {
    setSelectedDishes(prev =>
      prev.map(item => {
        if (item.dish.id === dishId) {
          const newQty = Math.max(1, Math.min(99, item.quantity + delta))
          return { ...item, quantity: newQty }
        }
        return item
      })
    )
  }

  // 计算总金额
  const totalAmount = selectedDishes.reduce((sum, item) => {
    if (item.dish.price != null) {
      return sum + (item.dish.price * item.quantity)
    }
    return sum
  }, 0)

  // 提交
  const handleSubmit = async () => {
    if (!groupType) {
      Taro.showToast({ title: '请选择群组类型', icon: 'none' })
      return
    }
    if (!groupId) {
      Taro.showToast({ title: '请选择群组', icon: 'none' })
      return
    }
    if (!dineMode) {
      Taro.showToast({ title: '请选择就餐模式', icon: 'none' })
      return
    }
    if (selectedDishes.length === 0) {
      Taro.showToast({ title: '请选择菜品', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      const orderItems = selectedDishes.map(item => ({
        dish_id: item.dish.id,
        quantity: item.quantity,
        unit_price: item.dish.price,
      }))

      await orderAPI.create({
        group_type: groupType,
        group_id: groupId,
        dine_mode: dineMode,
        order_items: orderItems,
      })

      Taro.showToast({ title: '创建成功', icon: 'success' })
      setTimeout(() => {
        Taro.navigateBack()
      }, 1500)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const getGroupLabel = (group: BuddyGroup | CoupleInfo): string => {
    if ('name' in group) {
      return group.name
    }
    return '情侣'
  }

  const getGroupValue = (group: BuddyGroup | CoupleInfo): string => {
    return group.id
  }

  return (
    <View className='page-create-order'>
      <ScrollView className='form-scroll' scrollY>
        {/* 群组类型 */}
        <View className='form-section'>
          <View className='section-title'>群组类型</View>
          <View className='option-row'>
            <View
              className={`option-item ${groupType === 'couple' ? 'active' : ''}`}
              onClick={() => setGroupType('couple')}
            >
              <Image className='option-icon' src={sticker('couple')} mode='aspectFit' />
              <Text className='option-label'>情侣</Text>
            </View>
            <View
              className={`option-item ${groupType === 'buddy' ? 'active' : ''}`}
              onClick={() => setGroupType('buddy')}
            >
              <Image className='option-icon' src={sticker('buddy')} mode='aspectFit' />
              <Text className='option-label'>饭搭子</Text>
            </View>
          </View>
        </View>

        {/* 群组选择 */}
        {groupType && groups.length > 0 && (
          <View className='form-section'>
            <View className='section-title'>选择群组</View>
            <View className='option-row'>
              {groups.map(group => (
                <View
                  key={getGroupValue(group)}
                  className={`option-item ${groupId === getGroupValue(group) ? 'active' : ''}`}
                  onClick={() => setGroupId(getGroupValue(group))}
                >
                  <Text className='option-label'>{getGroupLabel(group)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {groupType && groups.length === 0 && (
          <View className='form-section'>
            <View className='empty-hint'>
              <Text>暂无可用群组，请先创建或加入群组</Text>
            </View>
          </View>
        )}

        {/* 就餐模式 */}
        {groupId && (
          <View className='form-section'>
            <View className='section-title'>就餐模式</View>
            <View className='option-row'>
              <View
                className={`option-item large ${dineMode === 'together' ? 'active' : ''}`}
                onClick={() => setDineMode('together')}
              >
                <Image className='option-icon' src={sticker('menu')} mode='aspectFit' />
                <View className='option-text'>
                  <Text className='option-label'>共同就餐</Text>
                  <Text className='option-desc'>与伙伴一起用餐</Text>
                </View>
              </View>
              <View
                className={`option-item large ${dineMode === 'solo' ? 'active' : ''}`}
                onClick={() => setDineMode('solo')}
              >
                <Image className='option-icon' src={sticker('order-muted')} mode='aspectFit' />
                <View className='option-text'>
                  <Text className='option-label'>个人记录</Text>
                  <Text className='option-desc'>仅记录个人用餐</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* 菜品选择 */}
        {dineMode && (
          <View className='form-section'>
            <View className='section-title'>
              <Text>选择菜品</Text>
              {selectedDishes.length > 0 && (
                <Text className='selected-count'>已选 {selectedDishes.length} 道</Text>
              )}
            </View>

            {loadingDishes ? (
              <View className='loading-hint'>
                <Text>加载菜品中...</Text>
              </View>
            ) : dishes.length === 0 ? (
              <View className='empty-hint'>
                <Text>该群组暂无菜品，请先添加菜品</Text>
              </View>
            ) : (
              <View className='dish-list'>
                {dishes.map(dish => {
                  const selected = selectedDishes.find(item => item.dish.id === dish.id)
                  return (
                    <View
                      key={dish.id}
                      className={`dish-card ${selected ? 'selected' : ''}`}
                      onClick={() => handleSelectDish(dish)}
                    >
                      <View className='dish-info'>
                        <Text className='dish-name'>{dish.name}</Text>
                        <View className='dish-meta'>
                          {dish.category && (
                            <Text className='dish-category'>{dish.category}</Text>
                          )}
                          {dish.price != null && (
                            <Text className='dish-price'>
                              ¥{(dish.price / 100).toFixed(2)}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View className='dish-check'>
                        {selected ? (
                          <View className='check-icon checked'>✓</View>
                        ) : (
                          <View className='check-icon' />
                        )}
                      </View>

                      {/* 数量调节 */}
                      {selected && (
                        <View className='quantity-control'>
                          <View
                            className='qty-btn'
                            onClick={e => {
                              e.stopPropagation()
                              handleQuantityChange(dish.id, -1)
                            }}
                          >
                            <Text>-</Text>
                          </View>
                          <Text className='qty-value'>{selected.quantity}</Text>
                          <View
                            className='qty-btn'
                            onClick={e => {
                              e.stopPropagation()
                              handleQuantityChange(dish.id, 1)
                            }}
                          >
                            <Text>+</Text>
                          </View>
                        </View>
                      )}
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {/* 底部占位 */}
        <View className='bottom-placeholder' />
      </ScrollView>

      {/* 底部提交栏 */}
      <View className='submit-bar safe-bottom'>
        <View className='submit-info'>
          <Text className='submit-label'>合计</Text>
          <Text className='submit-amount'>¥{(totalAmount / 100).toFixed(2)}</Text>
        </View>
        <View
          className={`submit-btn ${submitting ? 'disabled' : ''}`}
          onClick={submitting ? undefined : handleSubmit}
        >
          <Text>{submitting ? '提交中...' : '提交点单'}</Text>
        </View>
      </View>
    </View>
  )
}
