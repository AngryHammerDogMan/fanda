import { View, Text, Image, Input, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom } from '@tarojs/taro'
import { useState, useCallback, useRef } from 'react'
import { dishAPI, tableAPI } from '@/services/api'
import type { Dish, DishListParams, Table } from '@/types'
import { LatestRequest } from '@/utils/latest-request'
import { getStoredTableId, getTableDisplayName, rememberTableId } from '@/utils/table'
import './index.scss'

// 菜品列表页：按类型与关键词浏览自建菜品，并承接下拉/滚动分页与新增入口。
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

const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function DishesIndex() {
  // activeTab/searchKeyword/page/hasMore 共同描述当前列表查询条件与分页游标。
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [dishes, setDishes] = useState<Dish[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const dishRequestRef = useRef(new LatestRequest())

  const pageSize = 10

  const loadDishes = useCallback(async (pageNum: number, append: boolean, options?: { tableId?: string; dishType?: string; keyword?: string }) => {
    const requestId = dishRequestRef.current.start()
    const tableId = options?.tableId ?? activeTableId
    const dishType = options?.dishType ?? activeTab
    const nextKeyword = options?.keyword ?? searchKeyword
    if (!tableId) return
    setLoading(true)

    try {
      const params: DishListParams = {
        table_id: tableId,
        page: pageNum,
        page_size: pageSize,
      }

      // “全部”不传 dish_type，让后端按默认全集合查询；具体类型才下发筛选条件。
      if (dishType !== 'all') {
        params.dish_type = dishType
      }

      if (nextKeyword.trim()) {
        params.keyword = nextKeyword.trim()
      }

      const res = await dishAPI.list(params)
      if (!dishRequestRef.current.isLatest(requestId)) return
      const data = res.data

      if (append) {
        setDishes(prev => [...prev, ...data.list])
      } else {
        setDishes(data.list)
      }

      setPage(pageNum)
      setHasMore(pageNum * pageSize < data.total)
    } catch (err) {
      if (dishRequestRef.current.isLatest(requestId)) {
        console.error('加载菜品列表失败', err)
      }
    } finally {
      if (dishRequestRef.current.isLatest(requestId)) {
        setLoading(false)
      }
    }
  }, [activeTab, activeTableId, searchKeyword])

  const loadTables = async () => {
    try {
      const res = await tableAPI.list()
      const list = res.data || []
      setTables(list)
      const nextTableId = activeTableId || getStoredTableId(list)
      setActiveTableId(nextTableId)
      rememberTableId(nextTableId)
      if (nextTableId) {
        setPage(1)
        setDishes([])
        setHasMore(true)
        loadDishes(1, false, { tableId: nextTableId })
      }
    } catch {
      Taro.showToast({ title: '加载餐桌失败', icon: 'none' })
    }
  }

  useDidShow(() => {
    loadTables()
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
    loadDishes(1, false, { dishType: key })
  }

  const handleTableChange = (tableId: string) => {
    setActiveTableId(tableId)
    rememberTableId(tableId)
    setDishes([])
    setPage(1)
    setHasMore(true)
    loadDishes(1, false, { tableId })
  }

  const handleSearch = () => {
    setDishes([])
    setPage(1)
    setHasMore(true)
    loadDishes(1, false, { keyword: searchKeyword })
  }

  const handleSearchClear = () => {
    setSearchKeyword('')
    setDishes([])
    setPage(1)
    setHasMore(true)
    loadDishes(1, false, { keyword: '' })
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
      <View className='dishes-hero'>
        <View>
          <Text className='fanda-title'>我们的菜单</Text>
          <Text className='fanda-subtitle'>{getTableDisplayName(tables.find(table => table.id === activeTableId) || null)} · 收藏会做的菜、外卖灵感和想去的餐厅</Text>
        </View>
        <Image className='hero-sticker' src={sticker('menu')} mode='aspectFit' />
      </View>

      <View className='tab-bar fanda-filter'>
        <ScrollView className='tab-scroll' scrollX scrollWithAnimation>
          <View className='tab-list'>
            {tables.map(table => (
              <View
                key={table.id}
                className={`tab-item ${activeTableId === table.id ? 'active' : ''}`}
                onClick={() => handleTableChange(table.id)}
              >
                <Text className='tab-label'>{getTableDisplayName(table)}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* 搜索栏 + 分类标签栏 — 吸顶 */}
      <View className='sticky-header'>
        <View className='search-bar'>
          <View className='search-input-wrap'>
            <Text className='search-icon'>搜索</Text>
            <Input
              className='search-input'
              placeholder='搜索菜品名称…'
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

        <View className='tab-bar fanda-filter'>
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
                    <Image className='placeholder-icon' src={sticker('menu')} mode='aspectFit' />
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

          {/* 加载状态 */}
          {loading && (
            <View className='loading-wrap'>
              <Text className='loading-text'>加载中…</Text>
            </View>
          )}
          {!hasMore && dishes.length > 0 && (
            <View className='loading-wrap'>
              <Text className='loading-text'>没有更多了</Text>
            </View>
          )}
          {!loading && dishes.length === 0 && (
            <View className='empty-wrap'>
              <Image className='sticker-icon' src={sticker('menu')} mode='aspectFit' />
              <Text className='empty-text'>暂无菜品</Text>
              <Text className='empty-hint'>点击右下角按钮添加菜品</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* 悬浮添加按钮 */}
      <View className='fab' onClick={handleCreate}>
        <Text className='fab-icon'>+</Text>
      </View>
    </View>
  )
}
