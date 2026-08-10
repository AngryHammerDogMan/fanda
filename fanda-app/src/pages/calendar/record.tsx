import { View, Text, Image, Input, Button } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import { useState } from 'react'
import { calendarAPI } from '@/services/api'
import type { CalendarRecord } from '@/types'
import './record.scss'

const MEAL_LABELS: Record<string, string> = { cook: '做饭', takeout: '外卖', dineout: '外出' }
const MEAL_COLORS: Record<string, string> = { cook: '#52C41A', takeout: '#FF6B35', dineout: '#1890FF' }
const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function RecordDetail() {
  const router = useRouter()
  const recordId = router.params?.id as string | undefined

  const [record, setRecord] = useState<CalendarRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useDidShow(() => {
    if (recordId) {
      loadRecord()
    }
  })

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
