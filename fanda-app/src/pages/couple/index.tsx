import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI } from '@/services/api'
import type { CoupleInfo } from '@/types'
import { getErrorMessage } from '@/utils/error'
import './index.scss'

// 情侣餐桌页：展示当前餐桌绑定状态，并支持生成邀请码或输入邀请码完成绑定。
const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function Couple() {
  // couple 来自 profile；joinCode 服务加入绑定流程。
  const [couple, setCouple] = useState<CoupleInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [joinCode, setJoinCode] = useState('')

  useDidShow(() => {
    loadUser()
  })

  const loadUser = async () => {
    try {
      const res = await authAPI.getProfile()
      setCouple(res.data.couple || null)
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  }

  const handleCreateInvite = async () => {
    setLoading(true)
    try {
      const res = await authAPI.createCoupleInvite()
      const { code } = res.data
      Taro.showModal({
        title: '邀请码已生成',
        content: `邀请码：${code}\n将此码分享给对方，对方在TA的账号中输入此码即可绑定`,
        showCancel: false,
        confirmText: '复制',
        success: () => {
          Taro.setClipboardData({ data: code })
          Taro.showToast({ title: '已复制', icon: 'success' })
        },
      })
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '生成失败'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleJoinCouple = async () => {
    if (!joinCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      await authAPI.joinCouple(joinCode.trim())
      Taro.showToast({ title: '绑定成功', icon: 'success' })
      setJoinCode('')
      setShowJoinInput(false)
      loadUser()
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '绑定失败'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleUnbind = () => {
    Taro.showModal({
      title: '解除绑定',
      content: '确定要解除情侣绑定吗？',
      success: (res) => {
        if (res.confirm) {
          // 页面预留入口，当前 API 层尚未提供情侣解绑接口。
          Taro.showToast({ title: '暂不支持解除绑定', icon: 'none' })
        }
      },
    })
  }

  return (
    <View className='page-couple'>
      {/* 当前状态 */}
      <View className='status-section'>
        <View className='status-header'>
          <Image className='status-icon' src={sticker('couple')} mode='aspectFit' />
          <Text className='status-title'>
            {couple ? '已绑定情侣餐桌' : '未绑定情侣餐桌'}
          </Text>
        </View>
        {couple ? (
          <View className='partner-card'>
            <View className='partner-avatar'>
              <Image className='partner-img' src={sticker('couple-muted')} mode='aspectFit' />
            </View>
            <View className='partner-info'>
              <Text className='partner-label'>对方ID</Text>
              <Text className='partner-value'>{couple.user2_id}</Text>
            </View>
            <View className='partner-status'>
              <View className='status-dot active' />
              <Text className='status-text'>已连接</Text>
            </View>
          </View>
        ) : (
          <View className='empty-couple'>
            <Text className='empty-text'>你还未绑定情侣餐桌</Text>
            <Text className='empty-hint'>创建或加入情侣餐桌，一起分享美食吧</Text>
          </View>
        )}
      </View>

      {/* 操作区 */}
      <View className='action-section'>
        {!couple ? (
          <>
            <View className='action-card'>
              <View className='action-header'>
                <Image className='action-icon' src={sticker('couple')} mode='aspectFit' />
                <Text className='action-title'>创建邀请</Text>
              </View>
              <Text className='action-desc'>生成邀请码，分享给对方完成绑定</Text>
              <View className='action-btn' onClick={handleCreateInvite}>
                <Text>{loading ? '生成中...' : '生成邀请码'}</Text>
              </View>
            </View>

            <View className='action-card'>
              <View className='action-header'>
                <Image className='action-icon' src={sticker('couple-muted')} mode='aspectFit' />
                <Text className='action-title'>加入情侣餐桌</Text>
              </View>
              <Text className='action-desc'>输入对方分享的邀请码完成绑定</Text>
              {showJoinInput ? (
                <View className='join-form'>
                  <Input
                    className='join-input'
                    placeholder='输入邀请码'
                    value={joinCode}
                    onInput={e => setJoinCode(e.detail.value)}
                    focus
                  />
                  <View className='join-actions'>
                    <View className='join-cancel' onClick={() => { setShowJoinInput(false); setJoinCode('') }}>
                      <Text>取消</Text>
                    </View>
                    <View className='join-confirm' onClick={handleJoinCouple}>
                      <Text>{loading ? '绑定中...' : '确认绑定'}</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View className='action-btn outline' onClick={() => setShowJoinInput(true)}>
                  <Text>输入邀请码</Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View className='action-card'>
            <View className='action-header'>
              <Image className='action-icon' src={sticker('couple')} mode='aspectFit' />
              <Text className='action-title'>情侣餐桌</Text>
            </View>
            <Text className='action-desc'>你们可以共享菜品、点单和日历记录</Text>
            <View className='action-btn outline danger' onClick={handleUnbind}>
              <Text>解除绑定</Text>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}
