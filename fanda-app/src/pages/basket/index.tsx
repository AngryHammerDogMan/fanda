import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { authAPI, featureAPI } from '@/services/api'
import type { User, BasketItem, BuddyGroup } from '@/types'
import './index.scss'

export default function Basket() {
  const [user, setUser] = useState<User | null>(null)
  const [groupType, setGroupType] = useState('couple')
  const [groupId, setGroupId] = useState('')
  const [groups, setGroups] = useState<BuddyGroup[]>([])
  const [items, setItems] = useState<BasketItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newQuantity, setNewQuantity] = useState('')

  useDidShow(() => {
    loadUser()
  })

  const loadUser = async () => {
    try {
      const res = await authAPI.getProfile()
      const u: User = res.data
      setUser(u)
      setGroups(u.buddy_groups || [])
      // 默认选择情侣
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

  const loadItems = async () => {
    if (!groupType || !groupId) return
    setLoading(true)
    try {
      const res = await featureAPI.listBasket(groupType, groupId)
      setItems(res.data?.list || res.data || [])
    } catch (err) {
      console.error('加载菜篮子失败', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (groupType && groupId) {
      loadItems()
    }
  }, [groupType, groupId])

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

  const handleTogglePurchased = async (item: BasketItem) => {
    try {
      await featureAPI.toggleBasket(item.id)
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, is_purchased: !i.is_purchased } : i
      ))
    } catch (err: any) {
      Taro.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  }

  const handleDelete = async (id: string) => {
    const result = await Taro.showModal({
      title: '确认删除',
      content: '确定要删除这个物品吗？',
    })
    if (!result.confirm) return
    try {
      await featureAPI.deleteBasket(id)
      setItems(prev => prev.filter(i => i.id !== id))
      Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (err: any) {
      Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
    }
  }

  const handleAddItem = async () => {
    if (!newName.trim()) {
      Taro.showToast({ title: '请输入物品名称', icon: 'none' })
      return
    }
    try {
      await featureAPI.addToBasket({
        group_type: groupType,
        group_id: groupId,
        name: newName.trim(),
        quantity: newQuantity.trim() || '1',
      })
      Taro.showToast({ title: '添加成功', icon: 'success' })
      setNewName('')
      setNewQuantity('')
      setShowAddForm(false)
      loadItems()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '添加失败', icon: 'none' })
    }
  }

  const purchasedCount = items.filter(i => i.is_purchased).length
  const totalCount = items.length

  return (
    <View className='page-basket'>
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
          <Text className='summary-label'>总计</Text>
        </View>
        <View className='summary-divider' />
        <View className='summary-item'>
          <Text className='summary-value purchased'>{purchasedCount}</Text>
          <Text className='summary-label'>已购买</Text>
        </View>
        <View className='summary-divider' />
        <View className='summary-item'>
          <Text className='summary-value unpurchased'>{totalCount - purchasedCount}</Text>
          <Text className='summary-label'>待购买</Text>
        </View>
      </View>

      {/* 物品列表 */}
      <View className='item-list'>
        {items.length === 0 && !loading ? (
          <View className='empty-state'>
            <Text className='empty-text'>菜篮子空空如也</Text>
            <Text className='empty-hint'>点击下方按钮添加物品</Text>
          </View>
        ) : (
          items.map(item => (
            <View key={item.id} className={`item-card ${item.is_purchased ? 'purchased' : ''}`}>
              <View className='item-checkbox' onClick={() => handleTogglePurchased(item)}>
                <View className={`checkbox ${item.is_purchased ? 'checked' : ''}`}>
                  {item.is_purchased && <Text className='checkbox-icon'>✓</Text>}
                </View>
              </View>
              <View className='item-info'>
                <Text className={`item-name ${item.is_purchased ? 'done' : ''}`}>{item.name}</Text>
                <Text className='item-quantity'>{item.quantity}</Text>
              </View>
              <View className='item-del' onClick={() => handleDelete(item.id)}>
                <Text className='del-icon'>🗑</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* 添加按钮 */}
      <View className='bottom-bar'>
        {showAddForm ? (
          <View className='add-form'>
            <View className='add-form-row'>
              <Input
                className='add-input name-input'
                placeholder='物品名称'
                value={newName}
                onInput={e => setNewName(e.detail.value)}
                focus
              />
              <Input
                className='add-input qty-input'
                placeholder='数量'
                value={newQuantity}
                onInput={e => setNewQuantity(e.detail.value)}
              />
            </View>
            <View className='add-form-actions'>
              <View className='add-cancel-btn' onClick={() => { setShowAddForm(false); setNewName(''); setNewQuantity('') }}>
                <Text>取消</Text>
              </View>
              <View className='add-confirm-btn' onClick={handleAddItem}>
                <Text>确认添加</Text>
              </View>
            </View>
          </View>
        ) : (
          <View className='add-btn' onClick={() => setShowAddForm(true)}>
            <Text className='add-btn-text'>+ 添加物品</Text>
          </View>
        )}
      </View>
    </View>
  )
}