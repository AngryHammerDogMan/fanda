import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useCallback } from 'react'
import { featureAPI, tableAPI } from '@/services/api'
import type { WishItem, Table } from '@/types'
import { getErrorMessage } from '@/utils/error'
import { getStoredTableId, getTableDisplayName, rememberTableId } from '@/utils/table'
import './index.scss'

// 心愿页：按餐桌维护想吃/想去清单，支持完成、删除与状态筛选。
const sticker = (name: string) => `/assets/stickers/${name}.png`

type FilterType = '全部' | '未完成' | '已完成'

export default function Wishes() {
  // activeTableId 决定心愿归属；filter 控制是否把完成状态传给接口。
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [wishes, setWishes] = useState<WishItem[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<FilterType>('全部')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newNote, setNewNote] = useState('')

  useDidShow(() => {
    loadTables()
  })

  const loadTables = async () => {
    try {
      const res = await tableAPI.list()
      const list = res.data || []
      setTables(list)
      const nextTableId = activeTableId || getStoredTableId(list)
      setActiveTableId(nextTableId)
      rememberTableId(nextTableId)
    } catch {
      Taro.showToast({ title: '加载餐桌失败', icon: 'none' })
    }
  }

  const loadWishes = useCallback(async () => {
    if (!activeTableId) return
    setLoading(true)
    try {
      // “全部”不传 completed，让后端返回完整列表；其他筛选转换为布尔值。
      const completedParam = filter === '全部' ? undefined : filter === '已完成'
      const res = await featureAPI.listWishes(activeTableId, completedParam)
      setWishes(Array.isArray(res.data) ? res.data : res.data?.list || [])
    } catch (err) {
      console.error('加载心愿失败', err)
    } finally {
      setLoading(false)
    }
  }, [activeTableId, filter])

  useEffect(() => {
    if (activeTableId) {
      loadWishes()
    }
  }, [activeTableId, filter, loadWishes])

  const handleTableChange = (tableId: string) => {
    setActiveTableId(tableId)
    rememberTableId(tableId)
  }

  const handleFilterChange = (f: FilterType) => {
    setFilter(f)
  }

  const handleToggleComplete = async (wish: WishItem) => {
    try {
      if (wish.is_completed) {
        // 当前后端只提供完成接口，不提供撤销完成；已完成项只提示不做本地回退。
        Taro.showToast({ title: '已完成的心愿不可取消', icon: 'none' })
        return
      }
      await featureAPI.completeWish(wish.id)
      setWishes(prev => prev.map(w =>
        w.id === wish.id ? { ...w, is_completed: true } : w
      ))
      Taro.showToast({ title: '心愿已完成', icon: 'success' })
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '操作失败'), icon: 'none' })
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
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '删除失败'), icon: 'none' })
    }
  }

  const handleCreateWish = async () => {
    if (!newName.trim()) {
      Taro.showToast({ title: '请输入心愿名称', icon: 'none' })
      return
    }
    try {
      await featureAPI.createWish({
        table_id: activeTableId,
        name: newName.trim(),
        note: newNote.trim(),
      })
      Taro.showToast({ title: '心愿已创建', icon: 'success' })
      setNewName('')
      setNewNote('')
      setShowAddForm(false)
      loadWishes()
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '创建失败'), icon: 'none' })
    }
  }

  const completedCount = wishes.filter(w => w.is_completed).length
  const totalCount = wishes.length

  return (
    <View className='page-wishes'>
      {/* 餐桌选择 */}
      <View className='group-bar'>
        <View className='group-type-tabs'>
          {tables.map(table => (
            <View
              key={table.id}
              className={`group-type-tab ${activeTableId === table.id ? 'active' : ''}`}
              onClick={() => handleTableChange(table.id)}
            >
              <Text>{getTableDisplayName(table)}</Text>
            </View>
          ))}
        </View>
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
