import { View, Text, Image, Input, Button, Picker } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { calendarAPI, tableAPI } from '@/services/api'
import type { CalendarRecord, PickerChangeEvent, Table } from '@/types'
import { getStoredTableId, getTableDisplayName, rememberTableId } from '@/utils/table'
import './record.scss'

const MEAL_LABELS: Record<string, string> = { cook: '做饭', takeout: '外卖', dineout: '外出' }
const MEAL_COLORS: Record<string, string> = { cook: '#52C41A', takeout: '#FF6B35', dineout: '#1890FF' }
const MEAL_TYPES = [
  { label: '做饭', value: 'cook' },
  { label: '外卖', value: 'takeout' },
  { label: '外出', value: 'dineout' },
]
const MEAL_PERIODS = ['早餐', '午餐', '晚餐', '夜宵']
const sticker = (name: string) => `/assets/stickers/${name}.png`

const getToday = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function RecordDetail() {
  const router = useRouter()
  const recordId = router.params?.id as string | undefined
  const isCreateMode = !recordId

  const [record, setRecord] = useState<CalendarRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [recordDate, setRecordDate] = useState(getToday())
  const [mealType, setMealType] = useState(MEAL_TYPES[0].value)
  const [mealPeriod, setMealPeriod] = useState(MEAL_PERIODS[2])
  const [restaurant, setRestaurant] = useState('')
  const [amount, setAmount] = useState('')
  const [content, setContent] = useState('')

  useDidShow(() => {
    if (isCreateMode) {
      loadCreateTables()
    } else {
      loadRecord()
    }
  })

  const loadCreateTables = async () => {
    try {
      const res = await tableAPI.list()
      const list = res.data || []
      const nextTableId = activeTableId || getStoredTableId(list)
      setTables(list)
      setActiveTableId(nextTableId)
      rememberTableId(nextTableId)
    } catch (err) {
      console.error('加载餐桌失败', err)
      Taro.showToast({ title: '加载餐桌失败', icon: 'none' })
    }
  }

  const loadRecord = async () => {
    if (!recordId) return
    setLoading(true)
    try {
      const res = await calendarAPI.get(recordId)
      setRecord(res.data)
    } catch (err) {
      console.error('加载记录失败', err)
      Taro.showToast({ title: '加载记录失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateRecord = async () => {
    if (!activeTableId) {
      Taro.showToast({ title: '请选择餐桌', icon: 'none' })
      return
    }
    setSubmitting(true)
    try {
      await calendarAPI.create({
        table_id: activeTableId,
        record_date: recordDate,
        meal_type: mealType,
        meal_period: mealPeriod,
        restaurant: restaurant.trim(),
        amount: amount ? Number(amount) : null,
        content: content.trim(),
      })
      rememberTableId(activeTableId)
      Taro.showToast({ title: '补记成功', icon: 'success' })
      setTimeout(() => {
        Taro.navigateBack()
      }, 800)
    } catch (err) {
      console.error('补记失败', err)
      Taro.showToast({ title: '补记失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleTableChange = (event: PickerChangeEvent) => {
    const index = Number(event.detail.value)
    const table = tables[index]
    if (!table) return
    setActiveTableId(table.id)
    rememberTableId(table.id)
  }

  const handleMealTypeChange = (event: PickerChangeEvent) => {
    const index = Number(event.detail.value)
    const nextType = MEAL_TYPES[index]
    if (nextType) setMealType(nextType.value)
  }

  const handleMealPeriodChange = (event: PickerChangeEvent) => {
    const index = Number(event.detail.value)
    const nextPeriod = MEAL_PERIODS[index]
    if (nextPeriod) setMealPeriod(nextPeriod)
  }

  const handleAddComment = async () => {
    if (!commentText.trim() || !recordId) return
    setSubmitting(true)
    try {
      await calendarAPI.addComment(recordId, commentText.trim())
      Taro.showToast({ title: '评论成功', icon: 'success' })
      setCommentText('')
      loadRecord()
    } catch (err) {
      console.error('评论失败', err)
      Taro.showToast({ title: '评论失败', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = () => {
    Taro.navigateTo({ url: `/pages/calendar/record?id=${recordId}&edit=1` })
  }

  const handleDelete = () => {
    Taro.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定要删除这条记录吗？',
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (res.confirm && recordId) {
          try {
            await calendarAPI.delete(recordId)
            Taro.showToast({ title: '删除成功', icon: 'success' })
            setTimeout(() => {
              Taro.navigateBack()
            }, 1000)
          } catch (err) {
            console.error('删除失败', err)
            Taro.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      }
    })
  }

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    const parts = dateStr.slice(0, 10).split('-')
    return `${parts[0]}年${parts[1]}月${parts[2]}日`
  }

  const activeTableIndex = Math.max(0, tables.findIndex(table => table.id === activeTableId))
  const activeMealTypeIndex = Math.max(0, MEAL_TYPES.findIndex(type => type.value === mealType))
  const activeMealPeriodIndex = Math.max(0, MEAL_PERIODS.findIndex(period => period === mealPeriod))

  if (isCreateMode) {
    return (
      <View className='page-record'>
        <View className='record-form-header'>
          <Image className='form-sticker' src={sticker('calendar')} mode='aspectFit' />
          <Text className='form-title'>补记一餐</Text>
          <Text className='form-subtitle'>把今天或之前漏掉的一顿饭补到日历里</Text>
        </View>

        <View className='record-form'>
          <View className='form-row'>
            <Text className='form-label'>餐桌</Text>
            <Picker mode='selector' range={tables.map(table => getTableDisplayName(table))} value={activeTableIndex} onChange={handleTableChange}>
              <View className='form-picker'>{getTableDisplayName(tables[activeTableIndex] || null)}</View>
            </Picker>
          </View>
          <View className='form-row'>
            <Text className='form-label'>日期</Text>
            <Picker mode='date' value={recordDate} onChange={(event: PickerChangeEvent<string>) => setRecordDate(event.detail.value)}>
              <View className='form-picker'>{recordDate}</View>
            </Picker>
          </View>
          <View className='form-row'>
            <Text className='form-label'>类型</Text>
            <Picker mode='selector' range={MEAL_TYPES.map(type => type.label)} value={activeMealTypeIndex} onChange={handleMealTypeChange}>
              <View className='form-picker'>{MEAL_TYPES[activeMealTypeIndex]?.label || '做饭'}</View>
            </Picker>
          </View>
          <View className='form-row'>
            <Text className='form-label'>餐次</Text>
            <Picker mode='selector' range={MEAL_PERIODS} value={activeMealPeriodIndex} onChange={handleMealPeriodChange}>
              <View className='form-picker'>{mealPeriod}</View>
            </Picker>
          </View>
          <View className='form-row'>
            <Text className='form-label'>餐厅/备注</Text>
            <Input className='form-input' value={restaurant} onInput={(event) => setRestaurant(event.detail.value)} placeholder='例如：家里 / 小区门口面馆' />
          </View>
          <View className='form-row'>
            <Text className='form-label'>金额</Text>
            <Input className='form-input' type='digit' value={amount} onInput={(event) => setAmount(event.detail.value)} placeholder='可不填' />
          </View>
          <View className='form-row vertical'>
            <Text className='form-label'>这一餐</Text>
            <Input className='form-input' value={content} onInput={(event) => setContent(event.detail.value)} placeholder='简单写写吃了什么' />
          </View>
        </View>

        <Button className='form-submit' loading={submitting} disabled={submitting} onClick={handleCreateRecord}>
          保存到日历
        </Button>
        <View className='safe-bottom' />
      </View>
    )
  }

  if (loading) {
    return (
      <View className='page-record'>
        <View className='loading-state'>
          <Text className='loading-text'>加载中…</Text>
        </View>
      </View>
    )
  }

  if (!record) {
    return (
      <View className='page-record'>
        <View className='empty-state'>
          <Image className='empty-icon' src={sticker('calendar')} mode='aspectFit' />
          <Text className='empty-text'>记录不存在</Text>
        </View>
      </View>
    )
  }

  return (
    <View className='page-record'>
      {/* 头部 */}
      <View className='record-header'>
        <View className='meal-badge' style={{ backgroundColor: MEAL_COLORS[record.meal_type] || '#999' }}>
          <Text className='badge-text'>{MEAL_LABELS[record.meal_type] || record.meal_type}</Text>
        </View>
        <View className='header-info'>
          <Text className='header-date'>{formatDate(record.record_date)}</Text>
          <Text className='header-period'>{record.meal_period}</Text>
        </View>
      </View>

      {/* 餐厅信息 */}
      <View className='info-section'>
        <View className='info-row'>
          <Text className='info-label'>餐厅</Text>
          <Text className='info-value'>{record.restaurant || '未记录'}</Text>
        </View>
        {record.amount != null && (
          <View className='info-row'>
            <Text className='info-label'>金额</Text>
            <Text className='info-value amount'>&yen;{record.amount}</Text>
          </View>
        )}
        {record.dish_ids && record.dish_ids.length > 0 && (
          <View className='info-row'>
            <Text className='info-label'>菜品</Text>
            <View className='dish-list'>
              {record.dish_ids.map((id, idx) => (
                <View key={id} className='dish-tag'>
                  <Text className='dish-text'>菜品 #{idx + 1}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* 照片 */}
      {record.photos && record.photos.length > 0 && (
        <View className='photo-section'>
          <Text className='section-title'>照片</Text>
          <View className='photo-grid'>
            {record.photos.map((photo, idx) => (
              <Image
                key={photo.id || idx}
                className='photo-item'
                src={photo.url}
                mode='aspectFill'
                onClick={() => {
                  const urls = record.photos?.map((p) => p.url) || []
                  Taro.previewImage({ current: photo.url, urls })
                }}
              />
            ))}
          </View>
        </View>
      )}

      {/* 评论 */}
      <View className='comment-section'>
        <Text className='section-title'>评论</Text>
        {record.comments && record.comments.length > 0 ? (
          <View className='comment-list'>
            {record.comments.map((c) => (
              <View key={c.id} className='comment-item'>
                <View className='comment-header'>
                  <Text className='comment-user'>用户 {c.user_id?.slice(0, 6)}</Text>
                  <Text className='comment-time'>{c.created_at?.slice(0, 10)}</Text>
                </View>
                <Text className='comment-content'>{c.content}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View className='comment-empty'>
            <Image className='comment-empty-icon' src={sticker('calendar-muted')} mode='aspectFit' />
            <Text className='empty-hint'>暂无评论</Text>
          </View>
        )}

        {/* 添加评论 */}
        <View className='comment-input-area'>
          <Input
            className='comment-input'
            value={commentText}
            onInput={(e) => setCommentText(e.detail.value)}
            placeholder='写一条评论...'
            placeholderClass='comment-placeholder'
            maxlength={200}
          />
          <Button
            className='comment-submit'
            onClick={handleAddComment}
            loading={submitting}
            disabled={!commentText.trim()}
          >
            发送
          </Button>
        </View>
      </View>

      {/* 操作按钮 */}
      <View className='action-buttons'>
        <View className='btn-edit' onClick={handleEdit}>
          <Text className='btn-text'>编辑</Text>
        </View>
        <View className='btn-delete' onClick={handleDelete}>
          <Text className='btn-text'>删除</Text>
        </View>
      </View>

      {/* 底部安全距离 */}
      <View className='safe-bottom' />
    </View>
  )
}
