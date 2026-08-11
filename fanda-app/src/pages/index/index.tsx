import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI, featureAPI } from '@/services/api'
import type { User, CheckinStatus } from '@/types'
import { getErrorMessage, isAuthError } from '@/utils/error'
import './index.scss'

// 首页：展示用户积分/签到概览，并汇总进入点单、菜篮子、心愿、预算等核心模块的快捷入口。
const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function Index() {
  // 首页只保留用户基础资料与签到状态，详情数据由各业务页按需加载。
  const [user, setUser] = useState<User | null>(null)
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null)

  useDidShow(() => {
    // 首页是 tab 入口，展示前先兜底校验 token，未登录时直接回到登录页。
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
    } catch (err: unknown) {
      if (isAuthError(err)) return
      console.error('加载用户信息失败', err)
    }
  }

  const loadCheckinStatus = async () => {
    try {
      const res = await featureAPI.getCheckinStatus()
      setCheckinStatus(res.data)
    } catch (err: unknown) {
      if (isAuthError(err)) return
      // 签到卡片是首页辅助信息，接口异常时保持空态，不阻塞首页主内容。
    }
  }

  const handleCheckin = async () => {
    try {
      const res = await featureAPI.checkin()
      Taro.showToast({ title: `签到成功！+${res.data.points}积分`, icon: 'success' })
      // 签到成功后只刷新签到摘要，避免重复拉取用户资料。
      loadCheckinStatus()
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '签到失败'), icon: 'none' })
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
            <Text className='quick-label'>开始点单</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/plaza/index')}>
            <Image className='sticker-icon' src={sticker('plaza')} mode='aspectFit' />
            <Text className='quick-label'>学菜广场</Text>
          </View>
          <View className='quick-item' onClick={() => navigateTo('/pages/dishes/index')}>
            <Image className='sticker-icon' src={sticker('menu')} mode='aspectFit' />
            <Text className='quick-label'>菜单管理</Text>
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
