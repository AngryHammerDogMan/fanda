import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI, featureAPI } from '@/services/api'
import type { User, CheckinStatus } from '@/types'
import './index.scss'

export default function Index() {
  const [user, setUser] = useState<User | null>(null)
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null)

  useDidShow(() => {
    // 重置登录跳转标记
    const token = Taro.getStorageSync('token')
    if (!token) {
      // 无 token，跳转登录页
      Taro.reLaunch({ url: '/pages/login/index' })
      return
    }
    loadProfile()
    loadCheckinStatus()
  })

  const loadProfile = async () => {
    try {
      const res = await authAPI.getProfile()
      setUser(res.data)
    } catch (err: any) {
      if (err.message === '未登录') return
      console.error('加载用户信息失败', err)
    }
  }

  const loadCheckinStatus = async () => {
    try {
      const res = await featureAPI.getCheckinStatus()
      setCheckinStatus(res.data)
    } catch (err: any) {
      if (err.message === '未登录') return
      // 未登录或接口错误忽略
    }
  }

  const handleCheckin = async () => {
    try {
      const res = await featureAPI.checkin()
      Taro.showToast({ title: `签到成功！+${res.data.points}积分`, icon: 'success' })
      loadCheckinStatus()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '签到失败', icon: 'none' })
    }
  }

  const navigateTo = (url: string) => {
    Taro.navigateTo({ url })
  }

  return (
    <View className='page-index'>
      {/* 头部 */}
      <View className='header'>
        <View className='header-bg' />
        <View className='header-content'>
          <View className='user-info'>
            <Image className='avatar' src={user?.avatar || ''} mode='aspectFill' />
            <View className='user-text'>
              <Text className='nickname'>{user?.nickname || '未登录'}</Text>
              <Text className='points'>{user?.points || 0} 积分</Text>
            </View>
          </View>
          <View className='header-actions'>
            <View className='action-item' onClick={() => navigateTo('/pages/basket/index')}>
              <Text className='action-icon'>🧺</Text>
              <Text className='action-label'>菜篮子</Text>
            </View>
            <View className='action-item' onClick={() => navigateTo('/pages/wishes/index')}>
              <Text className='action-icon'>💝</Text>
              <Text className='action-label'>心愿</Text>
            </View>
            <View className='action-item' onClick={() => navigateTo('/pages/budget/index')}>
              <Text className='action-icon'>💰</Text>
              <Text className='action-label'>预算</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 签到 */}
      <View className='section'>
        <View className='section-title'>每日签到</View>
        <View className='checkin-card' onClick={handleCheckin}>
          <View className='checkin-info'>
            <Text className='checkin-streak'>连续签到 {checkinStatus?.streak || 0} 天</Text>
            <Text className='checkin-month'>本月已签 {checkinStatus?.month_count || 0} 天</Text>
          </View>
          <View className={`checkin-btn ${checkinStatus?.today_checked ? 'checked' : ''}`}>
            {checkinStatus?.today_checked ? '已签到' : '签到'}
          </View>
        </View>
      </View>

      {/* 快捷入口 */}
      <View className='section'>
        <View className='section-title'>快捷入口</View>
        <View className='quick-actions'>
          <View className='quick-item' onClick={() => navigateTo('/pages/orders/create')}>
            <Text className='quick-icon'>📝</Text>
            <Text className='quick-label'>新建点单</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/plaza/index')}>
            <Text className='quick-icon'>📚</Text>
            <Text className='quick-label'>学菜广场</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/dishes/create')}>
            <Text className='quick-icon'>🍳</Text>
            <Text className='quick-label'>添加菜品</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/couple/index')}>
            <Text className='quick-icon'>💑</Text>
            <Text className='quick-label'>我的关系</Text>
          </View>
        </View>
      </View>

      {/* 最近订单 */}
      <View className='section'>
        <View className='section-header'>
          <Text className='section-title'>最近订单</Text>
          <Text className='section-more' onClick={() => navigateTo('/pages/orders/index')}>查看全部</Text>
        </View>
        <View className='empty-state'>
          <Text className='empty-text'>暂无订单记录</Text>
        </View>
      </View>
    </View>
  )
}