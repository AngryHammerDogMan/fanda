import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { useState, useCallback } from 'react'
import { orderAPI } from '@/services/api'
import type { Order, PaginatedData } from '@/types'
import './index.scss'

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'voted', label: '投票中' },
]

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending: { label: '待确认', className: 'status-pending' },
  confirmed: { label: '已确认', className: 'status-confirmed' },
  rejected: { label: '已拒绝', className: 'status-rejected' },
  cancelled: { label: '已取消', className: 'status-cancelled' },
  voted: { label: '投票中', className: 'status-voted' },
}

const DINE_MODE_MAP: Record<string, string> = {
  together: '共同就餐',
  solo: '个人记录',
}

const GROUP_TYPE_MAP: Record<string, string> = {
  couple: '情侣',
  buddy: '饭搭子',
}

const sticker = (name: string) => `/assets/stickers/${name}.png`

const PAGE_SIZE = 10

export default function Orders() {
  const [activeTab, setActiveTab] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useDidShow(() => {
    loadOrders(1, true)
  })

  usePullDownRefresh(() => {
    setRefreshing(true)
    loadOrders(1, true).finally(() => {
      Taro.stopPullDownRefresh()
      setRefreshing(false)
    })
  })

  useReachBottom(() => {
    if (orders.length < total && !loading) {
      loadOrders(page + 1)
    }
  })

  const loadOrders = useCallback(async (pageNum: number, reset = false) => {
    if (loading) return
    setLoading(true)
    try {
      const params: Record<string, any> = {
        page: pageNum,
        page_size: PAGE_SIZE,
      }
      if (activeTab) {
        params.status = activeTab
      }
      const res = await orderAPI.list(params)
      const data = res.data as PaginatedData<Order>
      if (reset) {
        setOrders(data.list || [])
        setPage(1)
      } else {
        setOrders(prev => [...prev, ...(data.list || [])])
        setPage(pageNum)
      }
      setTotal(data.total || 0)
    } catch (err) {
      console.error('加载订单失败', err)
    } finally {
      setLoading(false)
    }
  }, [activeTab, loading])

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    // 需要在状态更新后重新加载，这里用 setTimeout 确保状态已更新
    setTimeout(() => {
      loadOrders(1, true)
    }, 0)
  }

  // 当 activeTab 变化时重新加载
  const handleTabClick = (key: string) => {
    if (key === activeTab) return
    setActiveTab(key)
    // 由于 setState 是异步的，我们在下一个 tick 用新状态加载
  }

  // 使用 useEffect 监听 activeTab 变化
  // 由于 Taro 的限制，我们使用 didShow 和手动触发
  const switchTab = async (key: string) => {
    if (key === activeTab) return
    setActiveTab(key)
    setOrders([])
    setPage(1)
    setTotal(0)
    setLoading(true)
    try {
      const params: Record<string, any> = {
        page: 1,
        page_size: PAGE_SIZE,
      }
      if (key) {
        params.status = key
      }
      const res = await orderAPI.list(params)
      const data = res.data as PaginatedData<Order>
      setOrders(data.list || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('加载订单失败', err)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async (id: string) => {
    try {
      await orderAPI.confirm(id)
      Taro.showToast({ title: '已确认', icon: 'success' })
      loadOrders(1, true)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }

  const handleReject = async (id: string) => {
    try {
      await orderAPI.reject(id)
      Taro.showToast({ title: '已拒绝', icon: 'success' })
      loadOrders(1, true)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }

  const handleVote = async (id: string, vote: string) => {
    try {
      await orderAPI.vote(id, vote)
      Taro.showToast({ title: '投票成功', icon: 'success' })
      loadOrders(1, true)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '投票失败', icon: 'none' })
    }
  }

  const handleCancel = async (id: string) => {
    const res = await Taro.showModal({
      title: '提示',
      content: '确定要取消此订单吗？',
    })
    if (!res.confirm) return
    try {
      await orderAPI.cancel(id)
      Taro.showToast({ title: '已取消', icon: 'success' })
      loadOrders(1, true)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }

  const formatTime = (timeStr: string) => {
    if (!timeStr) return ''
    const date = new Date(timeStr)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${month}-${day} ${hour}:${min}`
  }

  const navigateToCreate = () => {
    Taro.navigateTo({ url: '/pages/orders/create' })
  }

  return (
    <View className='page-orders'>
      {/* 顶部 Tab 栏 */}
      <View className='tab-bar'>
        <ScrollView className='tab-scroll' scrollX scrollWithAnimation showScrollbar={false}>
          {STATUS_TABS.map(tab => (
            <View
              key={tab.key}
              className={`tab-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => switchTab(tab.key)}
            >
              <Text>{tab.label}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* 订单列表 */}
      <ScrollView
        className='order-list'
        scrollY
        refresherEnabled
        refresherTriggered={refreshing}
        onRefresherRefresh={() => {
          setRefreshing(true)
          loadOrders(1, true).finally(() => setRefreshing(false))
        }}
        refresherBackground='#FFF8F0'
      >
        {orders.length === 0 && !loading ? (
          <View className='empty-state'>
            <Image className='empty-icon' src={sticker('order')} mode='aspectFit' />
            <Text className='empty-text'>暂无订单</Text>
            <Text className='empty-hint'>点击下方按钮创建新的点单</Text>
          </View>
        ) : (
          orders.map(order => (
            <View key={order.id} className='order-card'>
              {/* 订单头部 */}
              <View className='order-header'>
                <View className='order-meta'>
                  <Text className='order-type'>
                    {GROUP_TYPE_MAP[order.group_type] || order.group_type}
                  </Text>
                  <Text className='order-dine-mode'>
                    {DINE_MODE_MAP[order.dine_mode] || order.dine_mode}
                  </Text>
                </View>
                <View className={`status-badge ${STATUS_MAP[order.status]?.className || ''}`}>
                  <Text>{STATUS_MAP[order.status]?.label || order.status}</Text>
                </View>
              </View>

              {/* 菜品列表 */}
              <View className='order-dishes'>
                {order.order_items?.map(item => (
                  <View key={item.id} className='dish-item'>
                    <Text className='dish-name'>{(item as any).dish_name || `菜品`}</Text>
                    <Text className='dish-quantity'>x{item.quantity}</Text>
                    {item.unit_price != null && (
                      <Text className='dish-price'>¥{(item.unit_price / 100).toFixed(2)}</Text>
                    )}
                  </View>
                ))}
              </View>

              {/* 订单底部 */}
              <View className='order-footer'>
                <View className='order-info'>
                  <Text className='order-time'>{formatTime(order.created_at)}</Text>
                  {order.total_amount != null && (
                    <Text className='order-total'>
                      合计：<Text className='total-price'>¥{(order.total_amount / 100).toFixed(2)}</Text>
                    </Text>
                  )}
                </View>

                {/* 操作按钮 */}
                <View className='order-actions'>
                  {order.status === 'pending' && (
                    <>
                      <View className='action-btn reject' onClick={() => handleReject(order.id)}>
                        <Text>拒绝</Text>
                      </View>
                      <View className='action-btn confirm' onClick={() => handleConfirm(order.id)}>
                        <Text>确认</Text>
                      </View>
                    </>
                  )}
                  {order.status === 'voted' && (
                    <>
                      <View className='action-btn reject' onClick={() => handleVote(order.id, 'reject')}>
                        <Text>反对</Text>
                      </View>
                      <View className='action-btn confirm' onClick={() => handleVote(order.id, 'approve')}>
                        <Text>赞成</Text>
                      </View>
                    </>
                  )}
                  {(order.status === 'pending' || order.status === 'voted') && (
                    <View className='action-btn cancel' onClick={() => handleCancel(order.id)}>
                      <Text>取消</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))
        )}

        {/* 加载更多 */}
        {loading && (
          <View className='loading-more'>
            <Text>加载中…</Text>
          </View>
        )}
        {orders.length >= total && orders.length > 0 && (
          <View className='loading-more'>
            <Text className='no-more'>没有更多了</Text>
          </View>
        )}
      </ScrollView>

      {/* 新建按钮 */}
      <View className='create-btn-wrapper safe-bottom'>
        <View className='create-btn' onClick={navigateToCreate}>
          <Text className='create-btn-text'>+ 新建点单</Text>
        </View>
      </View>
    </View>
  )
}
