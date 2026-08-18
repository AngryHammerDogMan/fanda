import { View, Text, Button, Input, Image } from '@tarojs/components'
import Taro, { useDidHide, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI } from '@/services/api'
import { isH5PreviewEnabled } from '@/services/h5-preview-mode'
import { getErrorMessage } from '@/utils/error'
import './index.scss'

// 登录页：承接平台授权、首次昵称设置、手机号绑定与 H5 预览登录入口。
// 自动检测当前平台，用于区分真实小程序登录能力与浏览器预览 mock。
const IS_H5_PREVIEW = isH5PreviewEnabled()
const CURRENT_PLATFORM = process.env.TARO_ENV === 'weapp' ? 'wechat' : 'douyin'
const PLATFORM_NAME = IS_H5_PREVIEW ? '浏览器预览' : CURRENT_PLATFORM === 'wechat' ? '微信' : '抖音'
const sticker = (name: string) => `/assets/stickers/${name}.png`
const LOGIN_BODY_CLASS = 'fanda-login-active'

const markLoginPageActive = () => {
  if (typeof document !== 'undefined') {
    document.body.classList.add(LOGIN_BODY_CLASS)
  }
}

const clearLoginPageActive = () => {
  if (typeof document !== 'undefined') {
    document.body.classList.remove(LOGIN_BODY_CLASS)
  }
}

const restoreMainTabbar = () => {
  clearLoginPageActive()
  Taro.showTabBar({ animation: false })
}

export default function Login() {
  const [loading, setLoading] = useState(false)
  // 登录步骤状态机：choose(平台一键登录) | wechat(平台登录中) | nickname(设置昵称) | bind_phone(绑定手机号)。
  const [step, setStep] = useState<'choose' | 'wechat' | 'nickname' | 'bind_phone'>('choose')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')

  // 已登录用户自动跳转首页
  useDidShow(() => {
    markLoginPageActive()
    Taro.hideTabBar({ animation: false })
    const token = Taro.getStorageSync('token')
    if (token) {
      restoreMainTabbar()
      Taro.switchTab({ url: '/pages/index/index' })
    }
  })

  useDidHide(() => {
    clearLoginPageActive()
  })

  const handleH5MockLogin = () => {
    // H5 预览不能调用微信/抖音登录，这里写入固定 token 和用户信息，让 API 层走本地 mock 响应。
    Taro.setStorageSync('token', 'h5-preview-token')
    Taro.setStorageSync('uid', 'h5-preview-user')
    Taro.setStorageSync('h5_preview_user', {
      uid: 'h5-preview-user',
      nickname: '饭搭预览用户',
      points: 1280,
      has_phone: true,
      has_wx: true,
      has_dy: true,
    })
    Taro.showToast({ title: '已进入预览模式', icon: 'success' })
    setTimeout(() => {
      restoreMainTabbar()
      Taro.switchTab({ url: '/pages/index/index' })
    }, 500)
  }

  // ============ 微信/抖音平台登录 ============
  const handlePlatformLogin = async () => {
    if (loading) return

    if (IS_H5_PREVIEW) {
      handleH5MockLogin()
      return
    }

    setLoading(true)
    setStep('wechat')

    try {
      const loginRes = await Taro.login()
      const res = await authAPI.login(loginRes.code, CURRENT_PLATFORM)

      Taro.setStorageSync('token', res.data.token)
      Taro.setStorageSync('uid', res.data.uid)

      // 后端返回的新用户/手机号状态决定后续强制步骤，避免未绑定账号进入主流程造成跨平台数据不互通。
      if (res.data.is_new) {
        // 新用户：先设置昵称
        setNickname(res.data.nickname || '')
        setStep('nickname')
      } else if (res.data.need_bind_phone) {
        // 老用户未绑定手机号：强制绑定
        setStep('bind_phone')
      } else {
        // 老用户已绑定手机号：直接进入
        Taro.showToast({ title: '欢迎回来', icon: 'success' })
        setTimeout(() => {
          restoreMainTabbar()
          Taro.switchTab({ url: '/pages/index/index' })
        }, 800)
      }
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '登录失败'), icon: 'none' })
      setStep('choose')
    } finally {
      setLoading(false)
    }
  }

  // ============ 设置昵称 ============
  const handleSaveNickname = async () => {
    if (!nickname.trim()) {
      Taro.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    try {
      await authAPI.updateProfile(nickname.trim(), '')
      Taro.showToast({ title: '设置成功', icon: 'success' })
      // 下一步：必须绑定手机号
      setStep('bind_phone')
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '保存失败'), icon: 'none' })
    }
  }

  // ============ 绑定手机号 ============
  const handleBindPhone = async () => {
    if (!phone || phone.length !== 11) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      await authAPI.bindPhone(phone)
      Taro.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => {
        restoreMainTabbar()
        Taro.switchTab({ url: '/pages/index/index' })
      }, 1000)
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '绑定失败'), icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // ============ 渲染 ============

  // Step 1: 选择登录方式
  if (step === 'choose') {
    return (
      <View className='page-login'>
        <View className='login-container'>
          {/* Logo */}
          <View className='logo-section login-hero'>
            <Image className='logo-icon' src={sticker('home')} mode='aspectFit' />
            <Text className='logo-title'>饭搭</Text>
            <Text className='logo-subtitle'>和喜欢的人一起吃饭</Text>
          </View>

          {/* 平台登录 */}
          <View className='login-block'>
            <Button
              className={`login-btn primary ${loading ? 'loading' : ''}`}
              onClick={handlePlatformLogin}
              loading={loading}
            >
              {IS_H5_PREVIEW ? '浏览器预览登录' : `${PLATFORM_NAME}一键登录`}
            </Button>
            <Text className='login-block-hint'>
              {IS_H5_PREVIEW
                ? 'H5 预览会使用本地 mock 用户，不调用微信或抖音登录能力'
                : '登录后会自动检查手机号；未绑定时再提示绑定，已绑定同一手机号的数据会自动互通'}
            </Text>
          </View>

          <Text className='agreement-text'>
            登录即表示同意《用户协议》和《隐私政策》
          </Text>
        </View>
      </View>
    )
  }

  // Step 2: 设置昵称（新用户首次登录后）
  if (step === 'nickname') {
    return (
      <View className='page-login'>
        <View className='login-container'>
          <View className='welcome-section'>
            <Image className='welcome-emoji' src={sticker('checkin')} mode='aspectFit' />
            <Text className='welcome-title'>欢迎加入饭搭！</Text>
            <Text className='welcome-desc'>设置一个昵称，让伙伴们认识你</Text>
          </View>

          <View className='nickname-input-wrap'>
            <Input
              className='nickname-input'
              value={nickname}
              placeholder='请输入昵称'
              placeholderClass='nickname-placeholder'
              maxlength={20}
              onInput={(e) => setNickname(e.detail.value)}
              focus
            />
          </View>

          <Button className='login-btn primary' onClick={handleSaveNickname}>
            下一步
          </Button>
        </View>
      </View>
    )
  }

  // Step 3: 绑定手机号（必须，不可跳过）
  if (step === 'bind_phone') {
    return (
      <View className='page-login'>
        <View className='login-container'>
          <View className='welcome-section'>
            <Image className='welcome-emoji' src={sticker('profile')} mode='aspectFit' />
            <Text className='welcome-title'>绑定手机号</Text>
            <Text className='welcome-desc'>
              如果手机号已绑定过，历史菜单、订单和日历会自动互通
            </Text>
          </View>

          <View className='phone-input-wrap'>
            <View className='phone-prefix'>
              <Text>+86</Text>
            </View>
            <Input
              className='phone-input'
              type='number'
              value={phone}
              placeholder='请输入手机号'
              placeholderClass='phone-placeholder'
              maxlength={11}
              onInput={(e) => setPhone(e.detail.value)}
              focus
            />
          </View>

          <Button
            className={`login-btn primary ${loading ? 'loading' : ''}`}
            onClick={handleBindPhone}
            loading={loading}
          >
            绑定并进入
          </Button>

          <Text className='agreement-text'>
            手机号仅用于账号识别和数据互通，不会泄露
          </Text>
        </View>
      </View>
    )
  }

  // 加载中（平台登录步骤）
  return (
    <View className='page-login'>
      <View className='login-container'>
        <View className='logo-section'>
          <Image className='logo-icon' src={sticker('home')} mode='aspectFit' />
          <Text className='logo-title'>饭搭</Text>
          <Text className='logo-subtitle'>正在登录…</Text>
        </View>
      </View>
    </View>
  )
}
