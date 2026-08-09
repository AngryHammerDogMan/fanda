import { View, Text, Button, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI } from '@/services/api'
import './index.scss'

// 自动检测当前平台
const CURRENT_PLATFORM = process.env.TARO_ENV === 'weapp' ? 'wechat' : 'douyin'
const PLATFORM_NAME = CURRENT_PLATFORM === 'wechat' ? '微信' : '抖音'
const OTHER_PLATFORM_NAME = CURRENT_PLATFORM === 'wechat' ? '抖音' : '微信'

export default function Login() {
  const [loading, setLoading] = useState(false)
  // 步骤: choose(选择登录方式) | phone(手机号登录) | wechat(平台登录后) | nickname(设置昵称) | bind_phone(绑定手机号)
  const [step, setStep] = useState<'choose' | 'phone' | 'wechat' | 'nickname' | 'bind_phone'>('choose')
  const [phone, setPhone] = useState('')
  const [nickname, setNickname] = useState('')
  const [loginData, setLoginData] = useState<any>(null)

  // 已登录用户自动跳转首页
  useDidShow(() => {
    const token = Taro.getStorageSync('token')
    if (token) {
      Taro.switchTab({ url: '/pages/index/index' })
    }
  })

  // ============ 手机号登录 ============
  const handlePhoneLogin = async () => {
    if (!phone || phone.length !== 11) {
      Taro.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }
    if (loading) return
    setLoading(true)

    try {
      const res = await authAPI.loginByPhone(phone)
      const data = res.data

      Taro.setStorageSync('token', data.token)
      Taro.setStorageSync('uid', data.uid)

      Taro.showToast({ title: data.is_new ? '注册成功' : '欢迎回来', icon: 'success' })
      setTimeout(() => {
        Taro.switchTab({ url: '/pages/index/index' })
      }, 800)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '登录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // ============ 微信/抖音平台登录 ============
  const handlePlatformLogin = async () => {
    if (loading) return
    setLoading(true)
    setStep('wechat')

    try {
      const loginRes = await Taro.login()
      const res = await authAPI.login(loginRes.code, CURRENT_PLATFORM)

      Taro.setStorageSync('token', res.data.token)
      Taro.setStorageSync('uid', res.data.uid)
      setLoginData(res.data)

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
          Taro.switchTab({ url: '/pages/index/index' })
        }, 800)
      }
    } catch (err: any) {
      Taro.showToast({ title: err.message || '登录失败', icon: 'none' })
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
    } catch (err: any) {
      Taro.showToast({ title: err.message || '保存失败', icon: 'none' })
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
        Taro.switchTab({ url: '/pages/index/index' })
      }, 1000)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '绑定失败', icon: 'none' })
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
          <View className='logo-section'>
            <Text className='logo-icon'>🍽️</Text>
            <Text className='logo-title'>饭搭</Text>
            <Text className='logo-subtitle'>和喜欢的人一起吃饭</Text>
          </View>

          {/* 手机号登录区 */}
          <View className='login-block'>
            <Text className='login-block-title'>手机号登录 / 注册</Text>
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
              />
            </View>
            <Button
              className={`login-btn primary ${loading ? 'loading' : ''}`}
              onClick={handlePhoneLogin}
              loading={loading}
            >
              登录 / 注册
            </Button>
            <Text className='login-block-hint'>手机号即账号，{PLATFORM_NAME}和{OTHER_PLATFORM_NAME}数据互通</Text>
          </View>

          {/* 分隔线 */}
          <View className='divider'>
            <View className='divider-line' />
            <Text className='divider-text'>其他方式</Text>
            <View className='divider-line' />
          </View>

          {/* 平台登录 */}
          <View className='login-block'>
            <Button
              className={`login-btn platform ${loading ? 'loading' : ''}`}
              onClick={handlePlatformLogin}
            >
              {PLATFORM_NAME}一键登录
            </Button>
            <Text className='login-block-hint'>登录后需要绑定手机号才能实现数据互通</Text>
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
            <Text className='welcome-emoji'>🎉</Text>
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
            <Text className='welcome-emoji'>📱</Text>
            <Text className='welcome-title'>绑定手机号</Text>
            <Text className='welcome-desc'>
              绑定后，{PLATFORM_NAME}和{OTHER_PLATFORM_NAME}数据自动互通
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
          <Text className='logo-icon'>🍽️</Text>
          <Text className='logo-title'>饭搭</Text>
          <Text className='logo-subtitle'>正在登录...</Text>
        </View>
      </View>
    </View>
  )
}