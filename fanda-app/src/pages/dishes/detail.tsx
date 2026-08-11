import { View, Text, Image } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { dishAPI } from '@/services/api'
import type { Dish } from '@/types'
import './detail.scss'

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '简单',
  2: '普通',
  3: '困难',
  4: '大师',
}

const DISH_TYPE_LABELS: Record<string, string> = {
  dish: '菜品',
  takeout: '外卖',
  dineout: '外食',
}

const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function DishDetail() {
  const router = useRouter()
  const { id } = router.params

  const [dish, setDish] = useState<Dish | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  useDidShow(() => {
    if (id) {
      loadDishDetail(id)
    }
  })

  const loadDishDetail = async (dishId: string) => {
    setLoading(true)
    try {
      const res = await dishAPI.get(dishId)
      setDish(res.data as Dish)
    } catch (err) {
      console.error('加载菜品详情失败', err)
      Taro.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleOrder = () => {
    if (!dish) return
    Taro.navigateTo({ url: `/pages/orders/create?dishId=${dish.id}` })
  }

  const handleEdit = () => {
    if (!dish) return
    Taro.navigateTo({ url: `/pages/dishes/create?id=${dish.id}` })
  }

  const handleDelete = () => {
    if (!dish) return
    Taro.showModal({
      title: '确认删除',
      content: `确定要删除菜品「${dish.name}」吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm) {
          try {
            await dishAPI.delete(dish.id)
            Taro.showToast({ title: '删除成功', icon: 'success' })
            setTimeout(() => {
              Taro.navigateBack()
            }, 1000)
          } catch (err) {
            console.error('删除菜品失败', err)
          }
        }
      },
    })
  }

  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return ''
    return `¥${price.toFixed(2)}`
  }

  if (loading) {
    return (
      <View className='page-dish-detail'>
        <View className='loading-wrap'>
          <Text className='loading-text'>加载中…</Text>
        </View>
      </View>
    )
  }

  if (!dish) {
    return (
      <View className='page-dish-detail'>
        <View className='empty-wrap'>
          <Text className='empty-text'>菜品不存在</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='page-dish-detail'>
      {/* 图片轮播 */}
      <View className='image-gallery'>
        {dish.photos && dish.photos.length > 0 ? (
          <Image
            className='gallery-image'
            src={dish.photos[currentImageIndex]}
            mode='aspectFill'
          />
        ) : (
          <View className='gallery-placeholder'>
            <Image className='placeholder-icon' src={sticker('menu')} mode='aspectFit' />
            <Text className='placeholder-text'>暂无图片</Text>
          </View>
        )}
        {dish.photos && dish.photos.length > 1 && (
          <View className='gallery-dots'>
            {dish.photos.map((_, idx) => (
              <View
                key={idx}
                className={`dot ${idx === currentImageIndex ? 'active' : ''}`}
                onClick={() => setCurrentImageIndex(idx)}
              />
            ))}
          </View>
        )}
      </View>

      {/* 基本信息 */}
      <View className='detail-section'>
        <View className='dish-header'>
          <Text className='dish-name'>{dish.name}</Text>
          <View className='dish-type-tag'>
            <Text className='type-tag-text'>{DISH_TYPE_LABELS[dish.dish_type] || dish.dish_type}</Text>
          </View>
        </View>

        <View className='dish-meta-row'>
          <View className='meta-item'>
            <Text className='meta-label'>分类</Text>
            <Text className='meta-value'>{dish.category || '未分类'}</Text>
          </View>
          {dish.difficulty && (
            <View className='meta-item'>
              <Text className='meta-label'>难度</Text>
              <Text className='meta-value difficulty'>{DIFFICULTY_LABELS[dish.difficulty]}</Text>
            </View>
          )}
          {dish.duration > 0 && (
            <View className='meta-item'>
              <Text className='meta-label'>耗时</Text>
              <Text className='meta-value'>{dish.duration}分钟</Text>
            </View>
          )}
        </View>

        {dish.price !== null && dish.price !== undefined && (
          <View className='price-row'>
            <Text className='price-label'>参考价格</Text>
            <Text className='price-value'>{formatPrice(dish.price)}</Text>
          </View>
        )}
      </View>

      {/* 标签 */}
      {dish.tags && dish.tags.length > 0 && (
        <View className='detail-section'>
          <View className='section-title'>
            <Text className='title-text'>标签</Text>
          </View>
          <View className='tags-wrap'>
            {dish.tags.map((tag, idx) => (
              <Text key={idx} className='tag-item'>{tag}</Text>
            ))}
          </View>
        </View>
      )}

      {/* 食材 */}
      {dish.ingredients && dish.ingredients.length > 0 && (
        <View className='detail-section'>
          <View className='section-title'>
            <Text className='title-text'>食材清单</Text>
          </View>
          <View className='ingredients-list'>
            {dish.ingredients.map((ing, idx) => (
              <View key={idx} className='ingredient-item'>
                <Text className='ingredient-name'>{ing.name}</Text>
                <Text className='ingredient-amount'>{ing.amount}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 步骤 */}
      {dish.steps && dish.steps.length > 0 && (
        <View className='detail-section'>
          <View className='section-title'>
            <Text className='title-text'>烹饪步骤</Text>
          </View>
          <View className='steps-list'>
            {[...dish.steps]
              .sort((a, b) => a.order - b.order)
              .map((step, idx) => (
                <View key={idx} className='step-item'>
                  <View className='step-order'>
                    <Text className='step-number'>{step.order}</Text>
                  </View>
                  <View className='step-content'>
                    <Text className='step-desc'>{step.description}</Text>
                    {step.image && (
                      <Image className='step-image' src={step.image} mode='widthFix' />
                    )}
                  </View>
                </View>
              ))}
          </View>
        </View>
      )}

      {/* 餐厅信息（外卖/外食） */}
      {(dish.dish_type === 'takeout' || dish.dish_type === 'dineout') && (
        <View className='detail-section'>
          <View className='section-title'>
            <Text className='title-text'>餐厅信息</Text>
          </View>
          <View className='restaurant-info'>
            {dish.restaurant && (
              <View className='info-row'>
                <Text className='info-label'>餐厅名称</Text>
                <Text className='info-value'>{dish.restaurant}</Text>
              </View>
            )}
            {dish.restaurant_note && (
              <View className='info-row'>
                <Text className='info-label'>备注</Text>
                <Text className='info-value'>{dish.restaurant_note}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* 底部操作栏 */}
      <View className='bottom-actions safe-bottom'>
        <View className='action-btn outline' onClick={handleEdit}>
          <Text className='btn-text'>编辑</Text>
        </View>
        <View className='action-btn danger' onClick={handleDelete}>
          <Text className='btn-text'>删除</Text>
        </View>
        <View className='action-btn primary' onClick={handleOrder}>
          <Text className='btn-text'>点单</Text>
        </View>
      </View>
    </View>
  )
}
