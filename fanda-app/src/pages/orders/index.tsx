import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow, useReachBottom, usePullDownRefresh } from '@tarojs/taro'
import { useState, useCallback } from 'react'
import { orderAPI } from '@/services/api'
import type { Order, OrderListParams } from '@/types'
import { getErrorMessage } from '@/utils/error'
import './index.scss'

// 订单列表页：按状态筛选点单记录，并提供确认、拒绝、投票和取消等订单操作。
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

const sticker = (name: string) => `/assets/stickers/${name}.png`
const DEFAULT_TABLE_ID = 'h5-personal-table'

const PAGE_SIZE = 10

export default function Orders() {
  // activeTab 与 page/total 共同控制当前订单查询条件和分页边界。
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
      const params: OrderListParams = {
        table_id: Taro.getStorageSync('last-order-table-id') || DEFAULT_TABLE_ID,
        page: pageNum,
        page_size: PAGE_SIZE,
      }
      // 空状态代表“全部”，不传 status 以复用后端默认列表逻辑。
      if (activeTab) {
        params.status = activeTab
      }
      const res = await orderAPI.list(params)
      const data = res.data
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

  const switchTab = async (key: string) => {
    if (key === activeTab) return
    setActiveTab(key)
    // 切换筛选时先清空列表，避免旧状态订单在新 tab 请求返回前短暂混入展示。
    setOrders([])
    setPage(1)
    setTotal(0)
    setLoading(true)
    try {
      const params: OrderListParams = {
        table_id: Taro.getStorageSync('last-order-table-id') || DEFAULT_TABLE_ID,
        page: 1,
        page_size: PAGE_SIZE,
      }
      // 这里直接使用入参 key 查询，避免等待 activeTab 的异步状态更新。
      if (key) {
        params.status = key
      }
      const res = await orderAPI.list(params)
      const data = res.data
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
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '操作失败'), icon: 'none' })
    }
  }

  const handleReject = async (id: string) => {
    try {
      await orderAPI.reject(id)
      Taro.showToast({ title: '已拒绝', icon: 'success' })
      loadOrders(1, true)
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '操作失败'), icon: 'none' })
    }
  }

  const handleVote = async (id: string, vote: string) => {
    try {
      await orderAPI.vote(id, vote)
      Taro.showToast({ title: '投票成功', icon: 'success' })
      loadOrders(1, true)
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '投票失败'), icon: 'none' })
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
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '操作失败'), icon: 'none' })
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
                    {order.table_id}
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
                    <Text className='dish-name'>{item.dish_name || `菜品`}</Text>
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
                  {/* pending 是确认流；voted 是投票流；两类状态都保留取消入口。 */}
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
