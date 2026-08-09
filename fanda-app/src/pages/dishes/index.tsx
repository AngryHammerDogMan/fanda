import { View, Text, Image, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { useState, useCallback } from 'react'
import { dishAPI } from '@/services/api'
import type { Dish, PaginatedData } from '@/types'
import './index.scss'

const DISH_TYPES = [
  { key: 'all', label: '全部' },
  { key: 'dish', label: '菜品' },
  { key: 'takeout', label: '外卖' },
  { key: 'dineout', label: '外食' },
]

const DIFFICULTY_LABELS: Record<number, string> = {
  1: '简单',
  2: '普通',
  3: '困难',
  4: '大师',
}

export default function DishesIndex() {
  const [activeTab, setActiveTab] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dishes, setDishes] = useState<Dish[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const pageSize = 10

  const loadDishes = useCallback(async (pageNum: number, append: boolean) => {
    if (loading) return
    setLoading(true)

    try {
      const params: Record<string, any> = {
        page: pageNum,
        page_size: pageSize,
      }

      if (activeTab !== 'all') {
        params.dish_type = activeTab
      }

      if (searchKeyword.trim()) {
        params.keyword = searchKeyword.trim()
      }

      const res = await dishAPI.list(params)
      const data = res.data as PaginatedData<Dish>

      if (append) {
        setDishes(prev => [...prev, ...data.list])
      } else {
        setDishes(data.list)
      }

      setTotal(data.total)
      setPage(pageNum)
      setHasMore(pageNum * pageSize < data.total)
    } catch (err) {
      console.error('加载菜品列表失败', err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, searchKeyword, loading])

  useDidShow(() => {
    setPage(1)
    setDishes([])
    setHasMore(true)
    loadDishes(1, false)
  })

  useReachBottom(() => {
    if (hasMore && !loading) {
      loadDishes(page + 1, true)
    }
  })

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setDishes([])
    setPage(1)
    setHasMore(true)
    // 触发重新加载
    setTimeout(() => {
      loadDishes(1, false)
    }, 0)
  }

  const handleSearch = () => {
    setDishes([])
    setPage(1)
    setHasMore(true)
    loadDishes(1, false)
  }

  const handleSearchClear = () => {
    setSearchKeyword('')
  }

  const handleDishClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/dishes/detail?id=${id}` })
  }

  const handleCreate = () => {
    Taro.navigateTo({ url: '/pages/dishes/create' })
  }

  const formatPrice = (price: number | null) => {
    if (price === null || price === undefined) return ''
    return `¥${price.toFixed(2)}`
  }

  const getDishTypeLabel = (type: string) => {
    const item = DISH_TYPES.find(t => t.key === type)
    return item ? item.label : ''
  }

  return (
    <View className='page-dishes'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <View className='search-input-wrap'>
          <Text className='search-icon'>🔍</Text>
          <Input
            className='search-input'
            placeholder='搜索菜品名称...'
            value={searchKeyword}
            onInput={(e) => setSearchKeyword(e.detail.value)}
            onConfirm={handleSearch}
            confirmType='search'
          />
          {searchKeyword && (
            <Text className='search-clear' onClick={handleSearchClear}>✕</Text>
          )}
        </View>
      </View>

      {/* 分类标签栏 */}
      <View className='tab-bar'>
        <ScrollView className='tab-scroll' scrollX scrollWithAnimation>
          <View className='tab-list'>
            {DISH_TYPES.map(item => (
              <View
                key={item.key}
                className={`tab-item ${activeTab === item.key ? 'active' : ''}`}
                onClick={() => handleTabChange(item.key)}
              >
                <Text className='tab-label'>{item.label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* 菜品列表 */}
      <ScrollView
        className='dish-list-scroll'
        scrollY
        onScrollToLower={() => {
          if (hasMore && !loading) loadDishes(page + 1, true)
        }}
        lowerThreshold={100}
      >
        <View className='dish-list'>
          {dishes.map(dish => (
            <View
              key={dish.id}
              className='dish-card'
              onClick={() => handleDishClick(dish.id)}
            >
              <View className='dish-image-wrap'>
                {dish.photos && dish.photos.length > 0 ? (
                  <Image
                    className='dish-image'
                    src={dish.photos[0]}
                    mode='aspectFill'
                  />
                ) : (
                  <View className='dish-image-placeholder'>
                    <Text className='placeholder-icon'>🍽️</Text>
                  </View>
                )}
                <View className='dish-type-badge'>
                  <Text className='badge-text'>{getDishTypeLabel(dish.dish_type)}</Text>
                </View>
              </View>
              <View className='dish-info'>
                <Text className='dish-name'>{dish.name}</Text>
                {dish.tags && dish.tags.length > 0 && (
                  <View className='dish-tags'>
                    {dish.tags.slice(0, 3).map((tag, idx) => (
                      <Text key={idx} className='tag'>{tag}</Text>
                    ))}
                  </View>
                )}
                <View className='dish-meta'>
                  {dish.difficulty && (
                    <Text className='meta-item difficulty'>
                      {DIFFICULTY_LABELS[dish.difficulty] || ''}
                    </Text>
                  )}
                  {dish.duration > 0 && (
                    <Text className='meta-item duration'>{dish.duration}分钟</Text>
                  )}
                </View>
                {dish.price !== null && dish.price !== undefined && (
                  <Text className='dish-price'>{formatPrice(dish.price)}</Text>
                )}
              </View>
            </View>
          ))}
        </View>

        {/* 加载状态 */}
        {loading && (
          <View className='loading-wrap'>
            <Text className='loading-text'>加载中...</Text>
          </View>
        )}
        {!hasMore && dishes.length > 0 && (
          <View className='loading-wrap'>
            <Text className='loading-text'>没有更多了</Text>
          </View>
        )}
        {!loading && dishes.length === 0 && (
          <View className='empty-wrap'>
            <Text className='empty-icon'>📭</Text>
            <Text className='empty-text'>暂无菜品</Text>
            <Text className='empty-hint'>点击右下角按钮添加菜品</Text>
          </View>
        )}
      </ScrollView>

      {/* 悬浮添加按钮 */}
      <View className='fab' onClick={handleCreate}>
        <Text className='fab-icon'>+</Text>
      </View>
    </View>
  )
}