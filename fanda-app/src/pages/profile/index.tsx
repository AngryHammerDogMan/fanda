import { View, Text, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI, featureAPI } from '@/services/api'
import type { User, CheckinStatus, PointRecord } from '@/types'
import { getErrorMessage } from '@/utils/error'
import './index.scss'

// 个人中心页：展示资料、账号绑定、关系入口、积分明细与退出登录。
// 自动检测当前平台，用于展示跨微信/抖音绑定提示，不参与业务请求参数。
const CURRENT_PLATFORM = process.env.TARO_ENV === 'weapp' ? 'wechat' : 'douyin'
const PLATFORM_NAME = CURRENT_PLATFORM === 'wechat' ? '微信' : '抖音'
const OTHER_PLATFORM_NAME = CURRENT_PLATFORM === 'wechat' ? '抖音' : '微信'
const sticker = (name: string) => `/assets/stickers/${name}.png`

type EditableModalResult = Taro.showModal.SuccessCallbackResult & {
  content?: string
}

type EditableModalOption = Omit<Taro.showModal.Option, 'success'> & {
  editable?: boolean
  placeholderText?: string
  success?: (res: EditableModalResult) => void
}

const showEditableModal = (option: EditableModalOption) => {
  return Taro.showModal(option as unknown as Taro.showModal.Option)
}

export default function Profile() {
  // user/checkinStatus 支撑顶部概览；pointHistory 只在用户主动展开时加载。
  const [user, setUser] = useState<User | null>(null)
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null)
  const [pointHistory, setPointHistory] = useState<PointRecord[]>([])
  const [showPointHistory, setShowPointHistory] = useState(false)

  useDidShow(() => {
    loadAll()
  })

  const loadAll = async () => {
    try {
      // 个人资料与签到状态互不依赖，并发加载减少进入个人中心时的等待。
      const [profileRes, checkinRes] = await Promise.all([
        authAPI.getProfile(),
        featureAPI.getCheckinStatus(),
      ])
      setUser(profileRes.data)
      setCheckinStatus(checkinRes.data)
    } catch (err) {
      console.error('加载数据失败', err)
    }
  }

  const loadPointHistory = async () => {
    try {
      // 积分记录不是首屏必需数据，点击“积分明细”后再取第一页。
      const res = await featureAPI.getPointHistory(1, 20)
      setPointHistory(res.data?.list || res.data || [])
      setShowPointHistory(true)
    } catch (err) {
      console.error('加载积分历史失败', err)
    }
  }

  const handleEditProfile = () => {
    showEditableModal({
      title: '修改昵称',
      editable: true,
      placeholderText: user?.nickname || '',
      success: async (res) => {
        if (res.confirm && res.content) {
          try {
            await authAPI.updateProfile(res.content, user?.avatar || '')
            Taro.showToast({ title: '修改成功', icon: 'success' })
            loadAll()
          } catch (err: unknown) {
            Taro.showToast({ title: getErrorMessage(err, '修改失败'), icon: 'none' })
          }
        }
      },
    })
  }

  const handleChooseAvatar = async () => {
    try {
      await Taro.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      // 当前仅走本地选图流程；后续接入云存储时再上传并回写头像 URL。
      Taro.showToast({ title: '头像上传成功', icon: 'success' })
      loadAll()
    } catch (err) {
      // 用户取消选择
    }
  }

  const handleBindPhoneAction = () => {
    showEditableModal({
      title: '绑定手机号',
      editable: true,
      placeholderText: '请输入手机号',
      success: async (res) => {
        if (res.confirm && res.content) {
          const phone = res.content.trim()
          if (phone.length !== 11) {
            Taro.showToast({ title: '请输入正确的手机号', icon: 'none' })
            return
          }
          try {
            await authAPI.bindPhone(phone)
            Taro.showToast({ title: '绑定成功', icon: 'success' })
            loadAll()
          } catch (err: unknown) {
            Taro.showToast({ title: getErrorMessage(err, '绑定失败'), icon: 'none' })
          }
        }
      },
    })
  }

  const handleNavigate = (url: string) => {
    Taro.navigateTo({ url })
  }

  const handleLogout = () => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          Taro.removeStorageSync('token')
          Taro.reLaunch({ url: '/pages/login/index' })
        }
      },
    })
  }

  return (
    <View className='page-profile'>
      {/* 头部个人信息 */}
      <View className='profile-header profile-hero'>
        <View className='header-bg' />
        <View className='header-content'>
          <View className='avatar-wrap' onClick={handleChooseAvatar}>
            <Image className='avatar' src={user?.avatar || ''} mode='aspectFill' />
            <View className='avatar-edit'>
              <Text>编辑</Text>
            </View>
          </View>
          <View className='user-info' onClick={handleEditProfile}>
            <Text className='nickname'>{user?.nickname || '未设置昵称'}</Text>
            <View className='edit-tag'>
              <Text>编辑</Text>
            </View>
          </View>
          <View className='points-row'>
            <View className='points-item'>
              <Text className='points-value'>{user?.points || 0}</Text>
              <Text className='points-label'>积分</Text>
            </View>
            <View className='points-divider' />
            <View className='points-item'>
              <Text className='points-value'>{checkinStatus?.streak || 0}</Text>
              <Text className='points-label'>连续签到</Text>
            </View>
            <View className='points-divider' />
            <View className='points-item'>
              <Text className='points-value'>{checkinStatus?.month_count || 0}</Text>
              <Text className='points-label'>本月签到</Text>
            </View>
          </View>
        </View>
      </View>

      {/* 账号绑定 */}
      <View className='section'>
        <View className='section-title'>账号绑定</View>
        <View className='bind-card'>
          {/* 手机号 */}
          <View className='bind-item'>
            <View className='bind-left'>
              <Image className='bind-icon' src={sticker('profile')} mode='aspectFit' />
              <View className='bind-text'>
                <Text className='bind-label'>手机号</Text>
                <Text className='bind-desc'>手机号相同会自动互通{PLATFORM_NAME}和{OTHER_PLATFORM_NAME}数据</Text>
              </View>
            </View>
            <Text className={`bind-status ${user?.has_phone ? 'bound' : ''}`}>
              {user?.has_phone ? (user?.phone || '已绑定') : '未绑定'}
            </Text>
          </View>

          {/* 微信 */}
          <View className='bind-item'>
            <View className='bind-left'>
              <Image className='bind-icon' src={sticker('home')} mode='aspectFit' />
              <View className='bind-text'>
                <Text className='bind-label'>微信</Text>
              </View>
            </View>
            <Text className={`bind-status ${user?.has_wx ? 'bound' : ''}`}>
              {user?.has_wx ? '已绑定' : '未绑定'}
            </Text>
          </View>

          {/* 抖音 */}
          <View className='bind-item'>
            <View className='bind-left'>
              <Image className='bind-icon' src={sticker('plaza')} mode='aspectFit' />
              <View className='bind-text'>
                <Text className='bind-label'>抖音</Text>
              </View>
            </View>
            <Text className={`bind-status ${user?.has_dy ? 'bound' : ''}`}>
              {user?.has_dy ? '已绑定' : '未绑定'}
            </Text>
          </View>

          {/* 操作按钮 */}
          {!user?.has_phone && (
            <View className='bind-actions'>
              <View className='bind-btn primary' onClick={handleBindPhoneAction}>
                <Text>绑定手机号</Text>
              </View>
            </View>
          )}
          {user?.has_phone && user?.has_wx && user?.has_dy && (
            <Text className='bind-all-done'>
                微信和抖音已绑定，数据实时同步
            </Text>
          )}
          {user?.has_phone && (!user?.has_wx || !user?.has_dy) && (
            <View className='bind-tip'>
              <Text className='bind-tip-text'>
                在{OTHER_PLATFORM_NAME}小程序登录后绑定同一个手机号，历史菜单、订单和日历会自动互通
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* 关系管理 */}
      <View className='section'>
        <View className='section-title'>关系管理</View>
        <View className='menu-list'>
          <View className='menu-item' onClick={() => handleNavigate('/pages/couple/index')}>
            <View className='menu-left'>
              <Image className='menu-icon' src={sticker('couple')} mode='aspectFit' />
              <View className='menu-text'>
                <Text className='menu-name'>情侣管理</Text>
                <Text className='menu-desc'>
                  {user?.couple ? '已绑定' : '未绑定'}
                </Text>
              </View>
            </View>
            <Text className='menu-arrow'>&gt;</Text>
          </View>
          <View className='menu-item' onClick={() => handleNavigate('/pages/buddy/index')}>
            <View className='menu-left'>
              <Image className='menu-icon' src={sticker('buddy')} mode='aspectFit' />
              <View className='menu-text'>
                <Text className='menu-name'>饭搭子管理</Text>
                <Text className='menu-desc'>
                  {user?.buddy_groups?.length || 0} 个群组
                </Text>
              </View>
            </View>
            <Text className='menu-arrow'>&gt;</Text>
          </View>
        </View>
      </View>

      {/* 积分与签到 */}
      <View className='section'>
        <View className='section-title'>积分与签到</View>
        <View className='menu-list'>
          <View className='menu-item' onClick={loadPointHistory}>
            <View className='menu-left'>
              <Image className='menu-icon' src={sticker('checkin')} mode='aspectFit' />
              <View className='menu-text'>
                <Text className='menu-name'>积分明细</Text>
                <Text className='menu-desc'>查看积分获取记录</Text>
              </View>
            </View>
            <Text className='menu-arrow'>&gt;</Text>
          </View>
        </View>
      </View>

      {/* 积分历史 */}
      {showPointHistory && (
        <View className='section'>
          <View className='section-title'>积分记录</View>
          {pointHistory.length === 0 ? (
            <View className='empty-history'>
              <Text className='empty-text'>暂无积分记录</Text>
            </View>
          ) : (
            <View className='history-list'>
              {pointHistory.map(record => (
                <View key={record.id} className='history-item'>
                  <View className='history-info'>
                    <Text className='history-reason'>{record.reason}</Text>
                    <Text className='history-date'>{record.created_at}</Text>
                  </View>
                  <Text className={`history-points ${record.points >= 0 ? 'positive' : 'negative'}`}>
                    {record.points >= 0 ? '+' : ''}{record.points}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* 设置 */}
      <View className='section'>
        <View className='section-title'>设置</View>
        <View className='menu-list'>
          <View className='menu-item'>
            <View className='menu-left'>
              <Image className='menu-icon' src={sticker('profile')} mode='aspectFit' />
              <View className='menu-text'>
                <Text className='menu-name'>通用设置</Text>
              </View>
            </View>
            <Text className='menu-arrow'>&gt;</Text>
          </View>
          <View className='menu-item'>
            <View className='menu-left'>
              <Image className='menu-icon' src={sticker('wish')} mode='aspectFit' />
              <View className='menu-text'>
                <Text className='menu-name'>关于我们</Text>
              </View>
            </View>
            <Text className='menu-arrow'>&gt;</Text>
          </View>
        </View>
      </View>

      {/* 退出登录 */}
      <View className='logout-section'>
        <View className='logout-btn' onClick={handleLogout}>
          <Text>退出登录</Text>
        </View>
      </View>
    </View>
  )
}
