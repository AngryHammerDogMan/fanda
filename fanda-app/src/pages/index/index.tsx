import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI, featureAPI } from '@/services/api'
import type { User, CheckinStatus } from '@/types'
import './index.scss'

const sticker = (name: string) => `/assets/stickers/${name}.png`

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
      <View className='fanda-hero'>
        <View className='hero-main'>
          <View className='user-info'>
            <View className='avatar-shell'>
              {user?.avatar ? (
                <Image className='avatar' src={user.avatar} mode='aspectFill' />
              ) : (
                <Image className='avatar-sticker' src={sticker('profile')} mode='aspectFit' />
              )}
            </View>
            <View className='user-text'>
              <Text className='greeting'>今晚吃点好的</Text>
              <Text className='nickname'>{user?.nickname || '未登录'} · {user?.points || 0} 积分</Text>
            </View>
          </View>
          <View className='header-actions'>
            <View className='action-item' onClick={() => navigateTo('/pages/basket/index')}>
              <Image className='sticker-icon-sm' src={sticker('basket')} mode='aspectFit' />
              <Text className='action-label'>菜篮子</Text>
            </View>
            <View className='action-item' onClick={() => navigateTo('/pages/wishes/index')}>
              <Image className='sticker-icon-sm' src={sticker('wish')} mode='aspectFit' />
              <Text className='action-label'>心愿</Text>
            </View>
            <View className='action-item' onClick={() => navigateTo('/pages/budget/index')}>
              <Image className='sticker-icon-sm' src={sticker('budget')} mode='aspectFit' />
              <Text className='action-label'>预算</Text>
            </View>
          </View>
        </View>
      </View>

      <View className='section'>
        <View className='section-title'>今日餐桌</View>
        <View className='checkin-card' onClick={handleCheckin}>
          <Image className='sticker-icon' src={sticker('checkin')} mode='aspectFit' />
          <View className='checkin-info'>
            <Text className='checkin-streak'>连续签到 {checkinStatus?.streak || 0} 天</Text>
            <Text className='checkin-month'>本月已签 {checkinStatus?.month_count || 0} 天</Text>
          </View>
          <View className={`checkin-btn ${checkinStatus?.today_checked ? 'checked' : ''}`}>
            {checkinStatus?.today_checked ? '已签到' : '签到'}
          </View>
        </View>
      </View>

      <View className='section'>
        <View className='section-title'>快捷入口</View>
        <View className='quick-actions'>
          <View className='quick-item' onClick={() => navigateTo('/pages/orders/create')}>
            <Image className='sticker-icon' src={sticker('order')} mode='aspectFit' />
            <Text className='quick-label'>新建点单</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/plaza/index')}>
            <Image className='sticker-icon' src={sticker('plaza')} mode='aspectFit' />
            <Text className='quick-label'>学菜广场</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/dishes/create')}>
            <Image className='sticker-icon' src={sticker('menu')} mode='aspectFit' />
            <Text className='quick-label'>添加菜品</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/couple/index')}>
            <Image className='sticker-icon' src={sticker('couple')} mode='aspectFit' />
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
        <View className='empty-state fanda-empty'>
          <Image className='sticker-icon' src={sticker('order')} mode='aspectFit' />
          <Text className='empty-text'>暂无订单记录</Text>
        </View>
      </View>
    </View>
  )
}
