import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { authAPI, featureAPI } from '@/services/api'
import type { User, WishItem, BuddyGroup } from '@/types'
import './index.scss'

const sticker = (name: string) => `/assets/stickers/${name}.png`

type FilterType = '全部' | '未完成' | '已完成'

export default function Wishes() {
  const [user, setUser] = useState<User | null>(null)
  const [groupType, setGroupType] = useState('couple')
  const [groupId, setGroupId] = useState('')
  const [groups, setGroups] = useState<BuddyGroup[]>([])
  const [wishes, setWishes] = useState<WishItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterType>('全部')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNote, setNewNote] = useState('')

  useDidShow(() => {
    loadUser()
  })

  const loadUser = async () => {
    try {
      const res = await authAPI.getProfile()
      const u: User = res.data
      setUser(u)
      setGroups(u.buddy_groups || [])
      if (u.couple) {
        setGroupType('couple')
        setGroupId(u.couple.id)
      } else if (u.buddy_groups && u.buddy_groups.length > 0) {
        setGroupType('buddy')
        setGroupId(u.buddy_groups[0].id)
      }
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  }

  const loadWishes = async () => {
    if (!groupType || !groupId) return
    setLoading(true)
    try {
      const completedParam = filter === '全部' ? undefined : filter === '已完成'
      const res = await featureAPI.listWishes(groupType, groupId, completedParam)
      setWishes(res.data?.list || res.data || [])
    } catch (err) {
      console.error('加载心愿失败', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (groupType && groupId) {
      loadWishes()
    }
  }, [groupType, groupId, filter])

  const handleGroupTypeChange = (type: string) => {
    setGroupType(type)
    if (type === 'couple' && user?.couple) {
      setGroupId(user.couple.id)
    } else {
      setGroupId('')
    }
  }

  const handleGroupChange = (gid: string) => {
    setGroupId(gid)
  }

  const handleFilterChange = (f: FilterType) => {
    setFilter(f)
  }

  const handleToggleComplete = async (wish: WishItem) => {
    try {
      if (wish.is_completed) {
        // 已完成 -> 取消完成（通过 API 不支持，这里仅做 UI 提示）
        Taro.showToast({ title: '已完成的心愿不可取消', icon: 'none' })
        return
      }
      await featureAPI.completeWish(wish.id)
      setWishes(prev => prev.map(w =>
        w.id === wish.id ? { ...w, is_completed: true } : w
      ))
      Taro.showToast({ title: '心愿已完成', icon: 'success' })
    } catch (err: any) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }

  const handleDelete = async (id: string) => {
    const result = await Taro.showModal({
      title: '确认删除',
      content: '确定要删除这个心愿吗？',
    })
    if (!result.confirm) return
    try {
      await featureAPI.deleteWish(id)
      setWishes(prev => prev.filter(w => w.id !== id))
      Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (err: any) {
      Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
    }
  }

  const handleCreateWish = async () => {
    if (!newName.trim()) {
      Taro.showToast({ title: '请输入心愿名称', icon: 'none' })
      return
    }
    try {
      await featureAPI.createWish({
        group_type: groupType,
        group_id: groupId,
        name: newName.trim(),
        note: newNote.trim(),
      })
      Taro.showToast({ title: '心愿已创建', icon: 'success' })
      setNewName('')
      setNewNote('')
      setShowAddForm(false)
      loadWishes()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '创建失败', icon: 'none' })
    }
  }

  const completedCount = wishes.filter(w => w.is_completed).length
  const totalCount = wishes.length

  return (
    <View className='page-wishes'>
      {/* 分组选择 */}
      <View className='group-bar'>
        <View className='group-type-tabs'>
          <View
            className={`group-type-tab ${groupType === 'couple' ? 'active' : ''}`}
            onClick={() => handleGroupTypeChange('couple')}
          >
            <Text>情侣</Text>
          </View>
          <View
            className={`group-type-tab ${groupType === 'buddy' ? 'active' : ''}`}
            onClick={() => handleGroupTypeChange('buddy')}
          >
            <Text>饭搭子</Text>
          </View>
        </View>
        {groupType === 'buddy' && groups.length > 0 && (
          <View className='group-select'>
            <View className='group-select-inner'>
              {groups.map(g => (
                <View
                  key={g.id}
                  className={`group-select-item ${groupId === g.id ? 'active' : ''}`}
                  onClick={() => handleGroupChange(g.id)}
                >
                  <Text>{g.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 统计摘要 */}
      <View className='summary-bar'>
        <View className='summary-item'>
          <Text className='summary-value'>{totalCount}</Text>
          <Text className='summary-label'>全部</Text>
        </View>
        <View className='summary-divider' />
        <View className='summary-item'>
          <Text className='summary-value completed'>{completedCount}</Text>
          <Text className='summary-label'>已完成</Text>
        </View>
        <View className='summary-divider' />
        <View className='summary-item'>
          <Text className='summary-value pending'>{totalCount - completedCount}</Text>
          <Text className='summary-label'>待完成</Text>
        </View>
      </View>

      {/* 筛选 */}
      <View className='filter-bar'>
        {(['全部', '未完成', '已完成'] as FilterType[]).map(f => (
          <View
            key={f}
            className={`filter-tab ${filter === f ? 'active' : ''}`}
            onClick={() => handleFilterChange(f)}
          >
            <Text>{f}</Text>
          </View>
        ))}
      </View>

      {/* 心愿列表 */}
      <View className='wish-list'>
        {wishes.length === 0 && !loading ? (
          <View className='empty-state'>
            <Image className='empty-icon' src={sticker('wish')} mode='aspectFit' />
            <Text className='empty-text'>暂无心愿</Text>
            <Text className='empty-hint'>点击下方按钮添加心愿</Text>
          </View>
        ) : (
          wishes.map(wish => (
            <View key={wish.id} className={`wish-card ${wish.is_completed ? 'completed' : ''}`}>
              <View className='wish-main'>
                <View className='wish-checkbox' onClick={() => handleToggleComplete(wish)}>
                  <View className={`checkbox ${wish.is_completed ? 'checked' : ''}`}>
                    {wish.is_completed && <Text className='checkbox-icon'>✓</Text>}
                  </View>
                </View>
                <View className='wish-info'>
                  <Text className={`wish-name ${wish.is_completed ? 'done' : ''}`}>{wish.name}</Text>
                  {wish.note ? (
                    <Text className='wish-note'>{wish.note}</Text>
                  ) : null}
                  <Text className='wish-date'>{wish.created_at}</Text>
                </View>
              </View>
              <View className='wish-del' onClick={() => handleDelete(wish.id)}>
                <Image className='del-icon' src={sticker('wish-muted')} mode='aspectFit' />
              </View>
            </View>
          ))
        )}
      </View>

      {/* 创建按钮 */}
      <View className='bottom-bar'>
        {showAddForm ? (
          <View className='add-form'>
            <Input
              className='add-input'
              placeholder='心愿名称'
              value={newName}
              onInput={e => setNewName(e.detail.value)}
              focus
            />
            <Input
              className='add-input add-input-note'
              placeholder='备注（可选）'
              value={newNote}
              onInput={e => setNewNote(e.detail.value)}
            />
            <View className='add-form-actions'>
              <View className='add-cancel-btn' onClick={() => { setShowAddForm(false); setNewName(''); setNewNote('') }}>
                <Text>取消</Text>
              </View>
              <View className='add-confirm-btn' onClick={handleCreateWish}>
                <Text>确认添加</Text>
              </View>
            </View>
          </View>
        ) : (
          <View className='add-btn' onClick={() => setShowAddForm(true)}>
            <Text className='add-btn-text'>+ 添加心愿</Text>
          </View>
        )}
      </View>
    </View>
  )
}
