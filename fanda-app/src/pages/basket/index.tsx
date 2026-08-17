import { View, Text, Input, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useCallback } from 'react'
import { featureAPI, tableAPI } from '@/services/api'
import type { BasketItem, Table } from '@/types'
import { getErrorMessage } from '@/utils/error'
import { getStoredTableId, getTableDisplayName, rememberTableId } from '@/utils/table'
import './index.scss'

// 菜篮子页：按餐桌维护采购清单，并支持添加、勾选已购与删除。
const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function Basket() {
  // activeTableId 锁定当前清单归属。
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [items, setItems] = useState<BasketItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newQuantity, setNewQuantity] = useState('')

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

  const loadItems = useCallback(async () => {
    if (!activeTableId) return
    setLoading(true)
    try {
      const res = await featureAPI.listBasket(activeTableId)
      setItems(Array.isArray(res.data) ? res.data : res.data?.list || [])
    } catch (err) {
      console.error('加载菜篮子失败', err)
    } finally {
      setLoading(false)
    }
  }, [activeTableId])

  useEffect(() => {
    if (activeTableId) {
      loadItems()
    }
  }, [activeTableId, loadItems])

  const handleTableChange = (tableId: string) => {
    setActiveTableId(tableId)
    rememberTableId(tableId)
  }

  const handleTogglePurchased = async (item: BasketItem) => {
    try {
      await featureAPI.toggleBasket(item.id)
      // 服务端切换成功后乐观更新本地勾选状态，避免重新拉全量列表。
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, is_purchased: !i.is_purchased } : i
      ))
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '操作失败'), icon: 'none' })
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
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '删除失败'), icon: 'none' })
    }
  }

  const handleAddItem = async () => {
    if (!newName.trim()) {
      Taro.showToast({ title: '请输入物品名称', icon: 'none' })
      return
    }
    try {
      await featureAPI.addToBasket({
        table_id: activeTableId,
        name: newName.trim(),
        quantity: newQuantity.trim() || '1',
      })
      Taro.showToast({ title: '添加成功', icon: 'success' })
      setNewName('')
      setNewQuantity('')
      setShowAddForm(false)
      loadItems()
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '添加失败'), icon: 'none' })
    }
  }

  const purchasedCount = items.filter(i => i.is_purchased).length
  const totalCount = items.length

  return (
    <View className='page-basket'>
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
            <Image className='empty-icon' src={sticker('basket')} mode='aspectFit' />
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
                <Image className='del-icon' src={sticker('basket-muted')} mode='aspectFit' />
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
