import { View, Text, Input, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useCallback } from 'react'
import { dishAPI } from '@/services/api'
import type { PlazaDish } from '@/types'
import './index.scss'

const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function Plaza() {
  const [categories, setCategories] = useState<string[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('全部')
  const [keyword, setKeyword] = useState('')
  const [dishes, setDishes] = useState<PlazaDish[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [groupType, setGroupType] = useState('couple')
  const [groupId, setGroupId] = useState('')

  useDidShow(() => {
    loadCategories()
    loadDishes(true)
  })

  const loadCategories = async () => {
    try {
      const res = await dishAPI.getPlazaCategories()
      const list: string[] = res.data?.categories || res.data || []
      setCategories(['全部', ...list])
    } catch (err) {
      console.error('加载分类失败', err)
    }
  }

  const loadDishes = async (reset = false) => {
    if (loading) return
    setLoading(true)
    const currentPage = reset ? 1 : page
    try {
      const params: Record<string, any> = { page: currentPage, page_size: 20 }
      if (activeCategory !== '全部') params.category = activeCategory
      if (keyword) params.keyword = keyword
      const res = await dishAPI.searchPlaza(params)
      const list: PlazaDish[] = res.data?.list || res.data || []
      const total = res.data?.total || 0
      if (reset) {
        setDishes(list)
        setPage(2)
      } else {
        setDishes(prev => [...prev, ...list])
        setPage(currentPage + 1)
      }
      setHasMore(reset ? list.length < total : (currentPage * 20) < total)
    } catch (err) {
      console.error('加载菜品失败', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCategoryChange = (cat: string) => {
    setActiveCategory(cat)
    setPage(1)
    // 延迟加载，等待 state 更新
    setTimeout(() => {
      loadDishes(true)
    }, 0)
  }

  const handleSearch = () => {
    setPage(1)
    loadDishes(true)
  }

  const handleImport = async (dish: PlazaDish) => {
    if (!groupType || !groupId) {
      Taro.showToast({ title: '请先选择目标分组', icon: 'none' })
      return
    }
    try {
      await dishAPI.importFromPlaza(dish.id, groupType, groupId)
      Taro.showToast({ title: '导入成功', icon: 'success' })
      // 更新导入计数
      setDishes(prev => prev.map(d =>
        d.id === dish.id ? { ...d, import_count: d.import_count + 1 } : d
      ))
    } catch (err: any) {
      Taro.showToast({ title: err.message || '导入失败', icon: 'none' })
    }
  }

  const handleViewDetail = (id: string) => {
    Taro.navigateTo({ url: `/pages/dishes/detail?id=${id}` })
  }

  const getDifficultyColor = (level: number | null) => {
    if (!level) return '#999'
    if (level <= 1) return '#52C41A'
    if (level <= 2) return '#FAAD14'
    return '#FF4D4F'
  }

  const getDifficultyText = (level: number | null) => {
    if (!level) return '未知'
    const map: Record<number, string> = { 1: '简单', 2: '中等', 3: '困难', 4: '极难', 5: '地狱' }
    return map[level] || '未知'
  }

  return (
    <View className='page-plaza'>
      {/* 搜索栏 */}
      <View className='search-bar'>
        <View className='search-input-wrap'>
          <Image className='search-icon' src={sticker('plaza-muted')} mode='aspectFit' />
          <Input
            className='search-input'
            placeholder='搜索菜品名称…'
            value={keyword}
            onInput={e => setKeyword(e.detail.value)}
            onConfirm={handleSearch}
          />
        </View>
        <View className='search-btn' onClick={handleSearch}>搜索</View>
      </View>

      {/* 分类标签 */}
      <ScrollView className='category-tabs' scrollX enableFlex>
        <View className='category-tabs-inner'>
          {categories.map(cat => (
            <View
              key={cat}
              className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => handleCategoryChange(cat)}
            >
              <Text>{cat}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 目标分组选择 */}
      <View className='group-selector'>
        <Text className='group-label'>导入到：</Text>
        <View className='group-options'>
          <View
            className={`group-option ${groupType === 'couple' ? 'active' : ''}`}
            onClick={() => setGroupType('couple')}
          >
            <Text>情侣</Text>
          </View>
          <View
            className={`group-option ${groupType === 'buddy' ? 'active' : ''}`}
            onClick={() => { setGroupType('buddy'); setGroupId('') }}
          >
            <Text>饭搭子</Text>
          </View>
        </View>
      </View>

      {/* 菜品列表 */}
      <ScrollView
        className='dish-list'
        scrollY
        onScrollToLower={() => loadDishes()}
      >
        {dishes.length === 0 && !loading ? (
          <View className='empty-state'>
            <Image className='empty-icon' src={sticker('plaza')} mode='aspectFit' />
            <Text className='empty-text'>暂无菜品</Text>
          </View>
        ) : (
          <View className='dish-grid'>
            {dishes.map(dish => (
              <View key={dish.id} className='dish-card'>
                <View className='dish-image-wrap' onClick={() => handleViewDetail(dish.id)}>
                  <Image
                    className='dish-image'
                    src={dish.photos?.[0] || ''}
                    mode='aspectFill'
                  />
                  <View className='dish-difficulty' style={{ background: getDifficultyColor(dish.difficulty) }}>
                    <Text>{getDifficultyText(dish.difficulty)}</Text>
                  </View>
                </View>
                <View className='dish-info' onClick={() => handleViewDetail(dish.id)}>
                  <Text className='dish-name'>{dish.name}</Text>
                  <View className='dish-meta'>
                    <Text className='dish-category'>{dish.category}</Text>
                    <Text className='dish-duration'>{dish.duration}分钟</Text>
                  </View>
                  {dish.tags && dish.tags.length > 0 && (
                    <View className='dish-tags'>
                      {dish.tags.slice(0, 3).map((tag, idx) => (
                        <View key={idx} className='dish-tag'>
                          <Text>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View className='dish-actions'>
                  <View className='import-count'>
                    <Text>{dish.import_count} 人已导入</Text>
                  </View>
                  <View className='import-btn' onClick={() => handleImport(dish)}>
                    <Text>导入</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
        {loading && (
          <View className='loading-state'>
            <Text className='loading-text'>加载中…</Text>
          </View>
        )}
        {!hasMore && dishes.length > 0 && (
          <View className='no-more'>
            <Text className='no-more-text'>没有更多了</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
