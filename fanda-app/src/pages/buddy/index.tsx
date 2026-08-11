import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { authAPI } from '@/services/api'
import type { User, BuddyGroup, BuddyMember } from '@/types'
import './index.scss'

// 饭搭子管理页：维护用户的饭搭子群组、邀请加入流程与成员管理入口。
const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function Buddy() {
  // selectedGroup 驱动右侧/下方详情区；inviteCode/joinCode 分别承载邀请与加入流程。
  const [user, setUser] = useState<User | null>(null)
  const [groups, setGroups] = useState<BuddyGroup[]>([])
  const [members, setMembers] = useState<BuddyMember[]>([])
  const [selectedGroup, setSelectedGroup] = useState<BuddyGroup | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  const [showJoinInput, setShowJoinInput] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)

  useDidShow(() => {
    loadUser()
  })

  const loadUser = async () => {
    try {
      const res = await authAPI.getProfile()
      const u: User = res.data
      setUser(u)
      const gs = u.buddy_groups || []
      setGroups(gs)
      // 首次进入默认选中第一个群组，避免已有群组时详情区为空。
      if (gs.length > 0 && !selectedGroup) {
        setSelectedGroup(gs[0])
      }
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  }

  const handleSelectGroup = (group: BuddyGroup) => {
    setSelectedGroup(group)
    loadMembers(group.id)
  }

  const loadMembers = async (groupId: string) => {
    // 成员列表通过 getProfile 中的 buddy_groups 获取，这里简化处理。
    setLoading(true)
    try {
      // 重新获取 profile 以得到最新成员列表。
      const res = await authAPI.getProfile()
      const u: User = res.data
      setUser(u)
      setGroups(u.buddy_groups || [])
      // 从群组中获取成员（简化处理，实际项目应有专门的 API）。
      setMembers([])
    } catch (err) {
      console.error('加载成员失败', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      Taro.showToast({ title: '请输入群组名称', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      await authAPI.createBuddyGroup(newGroupName.trim())
      Taro.showToast({ title: '创建成功', icon: 'success' })
      setNewGroupName('')
      setShowCreateForm(false)
      loadUser()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateInvite = async () => {
    if (!selectedGroup) return
    setLoading(true)
    try {
      const res = await authAPI.createBuddyInvite(selectedGroup.id)
      // 邀请接口可能返回对象或字符串，统一提取为展示/复制用的邀请码。
      const code = res.data?.code || res.data
      setInviteCode(code)
      setShowInvite(true)
      Taro.showModal({
        title: '邀请码已生成',
        content: `邀请码：${code}\n将此码分享给好友加入群组`,
        showCancel: false,
        confirmText: '复制',
        success: () => {
          Taro.setClipboardData({ data: code })
          Taro.showToast({ title: '已复制', icon: 'success' })
        },
      })
    } catch (err: any) {
      Taro.showToast({ title: err.message || '生成失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleJoinGroup = async () => {
    // 加入群组接口依赖当前选中群组 ID，未选中时不发起请求。
    if (!selectedGroup) return
    if (!joinCode.trim()) {
      Taro.showToast({ title: '请输入邀请码', icon: 'none' })
      return
    }
    setLoading(true)
    try {
      await authAPI.joinBuddyGroup(selectedGroup.id, joinCode.trim())
      Taro.showToast({ title: '加入成功', icon: 'success' })
      setJoinCode('')
      setShowJoinInput(false)
      loadUser()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '加入失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveMember = async (uid: string) => {
    if (!selectedGroup) return
    const result = await Taro.showModal({
      title: '移除成员',
      content: '确定要移除该成员吗？',
    })
    if (!result.confirm) return
    try {
      await authAPI.removeBuddyMember(selectedGroup.id, uid)
      Taro.showToast({ title: '已移除', icon: 'success' })
      loadMembers(selectedGroup.id)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '移除失败', icon: 'none' })
    }
  }

  const isOwner = selectedGroup && user && selectedGroup.owner_id === user.uid

  return (
    <View className='page-buddy'>
      {/* 群组列表 */}
      <View className='group-section'>
        <View className='section-header'>
          <Text className='section-title'>我的饭搭子群组</Text>
          <View className='create-btn' onClick={() => setShowCreateForm(true)}>
            <Text>+ 新建</Text>
          </View>
        </View>

        {showCreateForm && (
          <View className='create-form'>
            <Input
              className='create-input'
              placeholder='输入群组名称'
              value={newGroupName}
              onInput={e => setNewGroupName(e.detail.value)}
              focus
            />
            <View className='create-actions'>
              <View className='create-cancel' onClick={() => { setShowCreateForm(false); setNewGroupName('') }}>
                <Text>取消</Text>
              </View>
              <View className='create-confirm' onClick={handleCreateGroup}>
                <Text>{loading ? '创建中...' : '创建'}</Text>
              </View>
            </View>
          </View>
        )}

        {groups.length === 0 ? (
          <View className='empty-groups'>
            <Image className='empty-icon' src={sticker('buddy')} mode='aspectFit' />
            <Text className='empty-text'>暂无饭搭子群组</Text>
            <Text className='empty-hint'>创建一个群组，邀请好友一起吃饭吧</Text>
          </View>
        ) : (
          <View className='group-list'>
            {groups.map(group => (
              <View
                key={group.id}
                className={`group-card ${selectedGroup?.id === group.id ? 'active' : ''}`}
                onClick={() => handleSelectGroup(group)}
              >
                <View className='group-info'>
                  <Text className='group-name'>{group.name}</Text>
                  <Text className='group-meta'>
                    {group.max_member}人上限 · {group.status === 'active' ? '活跃' : '已解散'}
                  </Text>
                </View>
                {group.owner_id === user?.uid && (
                  <View className='owner-tag'>
                    <Text>群主</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 选中群组的详情 */}
      {selectedGroup && (
        <View className='detail-section'>
          <View className='section-header'>
            <Text className='section-title'>{selectedGroup.name}</Text>
          </View>

          {/* 成员管理 */}
          <View className='member-section'>
            <View className='member-header'>
              <Text className='member-title'>成员列表</Text>
              <View className='member-actions'>
                <View className='member-action-btn' onClick={handleCreateInvite}>
                  <Text>邀请成员</Text>
                </View>
              </View>
            </View>

            {showJoinInput && (
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
                  <View className='join-confirm' onClick={handleJoinGroup}>
                    <Text>加入</Text>
                  </View>
                </View>
              </View>
            )}

            <View className='member-list'>
              <View className='member-item'>
                <View className='member-avatar'>
                  <Image className='member-avatar-img' src={sticker('profile')} mode='aspectFit' />
                </View>
                <View className='member-info'>
                  <Text className='member-name'>我（{user?.nickname}）</Text>
                  <Text className='member-role'>群主</Text>
                </View>
              </View>
              {members.map(member => (
                <View key={member.id} className='member-item'>
                  <View className='member-avatar'>
                    <Image className='member-avatar-img' src={sticker('buddy-muted')} mode='aspectFit' />
                  </View>
                  <View className='member-info'>
                    <Text className='member-name'>{member.user_id}</Text>
                    <Text className='member-role'>
                      {member.role === 'owner' ? '群主' : member.role === 'admin' ? '管理员' : '成员'}
                    </Text>
                  </View>
                  {isOwner && member.role !== 'owner' && (
                    <View className='remove-btn' onClick={() => handleRemoveMember(member.user_id)}>
                      <Text>移除</Text>
                    </View>
                  )}
                </View>
              ))}
              {members.length === 0 && (
                <View className='empty-members'>
                  <Text className='empty-text'>暂无其他成员</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}
    </View>
  )
}
