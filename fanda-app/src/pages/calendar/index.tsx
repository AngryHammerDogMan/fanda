import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { useState, useMemo } from 'react'
import { calendarAPI, authAPI } from '@/services/api'
import type { CalendarRecord, MonthlyStats, User } from '@/types'
import './index.scss'

const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六']
const MEAL_LABELS: Record<string, string> = { cook: '做饭', takeout: '外卖', dineout: '外出' }
const MEAL_COLORS: Record<string, string> = { cook: '#52C41A', takeout: '#FF6B35', dineout: '#1890FF' }

export default function Calendar() {
  const now = new Date()
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [groupType, setGroupType] = useState<string>('couple')
  const [groupId, setGroupId] = useState<string>('')

  const [user, setUser] = useState<User | null>(null)
  const [dateRecordsMap, setDateRecordsMap] = useState<Record<string, CalendarRecord[]>>({})
  const [selectedDateRecords, setSelectedDateRecords] = useState<CalendarRecord[]>([])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null)
  const [loading, setLoading] = useState(false)

  // 日历网格数据
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay()
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
    const daysInPrevMonth = new Date(currentYear, currentMonth - 1, 0).getDate()

    const cells: { day: number; type: 'prev' | 'current' | 'next'; date: string }[] = []

    // 上月末尾
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i
      const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1
      cells.push({ day: d, type: 'prev', date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }

    // 当月
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, type: 'current', date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
    }

    // 下月开头
    const remaining = 7 - (cells.length % 7)
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear
        const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
        cells.push({ day: d, type: 'next', date: `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
      }
    }

    return cells
  }, [currentYear, currentMonth])

  useDidShow(() => {
    loadUserAndInit()
  })

  const loadUserAndInit = async () => {
    try {
      const res = await authAPI.getProfile()
      const u: User = res.data
      setUser(u)

      if (groupType === 'couple' && u.couple) {
        setGroupId(u.couple.id)
      } else if (groupType === 'buddy' && u.buddy_groups.length > 0) {
        setGroupId(u.buddy_groups[0].id)
      } else {
        setGroupId('')
      }
    } catch (err) {
      console.error('加载用户信息失败', err)
    }
  }

  // 当 groupType 或 groupId 变化时加载数据
  useDidShow(() => {
    if (groupId) {
      loadMonthRecords()
      loadStats()
    }
  })

  const loadMonthRecords = async () => {
    if (!groupId) return
    setLoading(true)
    try {
      const res = await calendarAPI.listByMonth(groupType, groupId, currentYear, currentMonth)
      const records: CalendarRecord[] = res.data?.list || res.data || []
      const map: Record<string, CalendarRecord[]> = {}
      records.forEach((r: CalendarRecord) => {
        const date = r.record_date?.slice(0, 10)
        if (date) {
          if (!map[date]) map[date] = []
          map[date].push(r)
        }
      })
      setDateRecordsMap(map)
    } catch (err) {
      console.error('加载日历记录失败', err)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    if (!groupId) return
    try {
      const res = await calendarAPI.getStats(groupType, groupId, currentYear, currentMonth)
      setMonthlyStats(res.data)
    } catch (err) {
      console.error('加载统计失败', err)
    }
  }

  const loadDateRecords = async (date: string) => {
    if (!groupId) return
    try {
      const res = await calendarAPI.listByDate(groupType, groupId, date)
      setSelectedDateRecords(res.data?.list || res.data || [])
    } catch (err) {
      console.error('加载日期记录失败', err)
      setSelectedDateRecords([])
    }
  }

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(currentYear - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
    setSelectedDate('')
    setSelectedDateRecords([])
  }

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(currentYear + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
    setSelectedDate('')
    setSelectedDateRecords([])
  }

  const handleDateClick = (cell: { day: number; type: string; date: string }) => {
    if (cell.type !== 'current') return
    setSelectedDate(cell.date)
    loadDateRecords(cell.date)
  }

  const handleGroupTypeChange = (type: string) => {
    setGroupType(type)
    setSelectedDate('')
    setSelectedDateRecords([])
    if (type === 'couple' && user?.couple) {
      setGroupId(user.couple.id)
    } else if (type === 'buddy' && user?.buddy_groups?.length) {
      setGroupId(user.buddy_groups[0].id)
    } else {
      setGroupId('')
    }
  }

  const handleAddRecord = () => {
    Taro.navigateTo({ url: '/pages/calendar/record' })
  }

  const handleRecordClick = (id: string) => {
    Taro.navigateTo({ url: `/pages/calendar/record?id=${id}` })
  }

  const getDateRecords = (date: string): CalendarRecord[] => {
    return dateRecordsMap[date] || []
  }

  const isToday = (date: string): boolean => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    return date === `${y}-${m}-${d}`
  }

  const formatDate = (dateStr: string): string => {
    const parts = dateStr.split('-')
    return `${parts[1]}月${parts[2]}日`
  }

  const statMealCounts = useMemo(() => {
    const counts: { key: string; label: string; count: number; color: string }[] = []
    if (monthlyStats?.meal_count) {
      Object.entries(monthlyStats.meal_count).forEach(([key, count]) => {
        counts.push({ key, label: MEAL_LABELS[key] || key, count, color: MEAL_COLORS[key] || '#999' })
      })
    }
    return counts
  }, [monthlyStats])

  return (
    <View className='page-calendar'>
      {/* 分组选择器 */}
      <View className='group-selector'>
        <View
          className={`group-tab ${groupType === 'couple' ? 'active' : ''}`}
          onClick={() => handleGroupTypeChange('couple')}
        >
          情侣
        </View>
        <View
          className={`group-tab ${groupType === 'buddy' ? 'active' : ''}`}
          onClick={() => handleGroupTypeChange('buddy')}
        >
          饭搭子
        </View>
      </View>

      {/* 月份导航 */}
      <View className='month-nav'>
        <View className='nav-arrow' onClick={handlePrevMonth}>
          <Text className='arrow-text'>{'<'}</Text>
        </View>
        <Text className='month-title'>{currentYear}年 {currentMonth}月</Text>
        <View className='nav-arrow' onClick={handleNextMonth}>
          <Text className='arrow-text'>{'>'}</Text>
        </View>
      </View>

      {/* 周标题 */}
      <View className='week-header'>
        {WEEK_DAYS.map((day) => (
          <View key={day} className='week-cell'>
            <Text className='week-text'>{day}</Text>
          </View>
        ))}
      </View>

      {/* 日历网格 */}
      <View className='calendar-grid'>
        {calendarGrid.map((cell, index) => {
          const records = getDateRecords(cell.date)
          const types = [...new Set(records.map((r) => r.meal_type))]
          const selected = cell.date === selectedDate
          const today = isToday(cell.date)

          return (
            <View
              key={index}
              className={`calendar-cell ${cell.type !== 'current' ? 'other-month' : ''} ${selected ? 'selected' : ''}`}
              onClick={() => handleDateClick(cell)}
            >
              <Text className={`day-num ${today ? 'today' : ''}`}>{cell.day}</Text>
              {types.length > 0 && (
                <View className='dots-row'>
                  {types.map((t) => (
                    <View key={t} className='dot' style={{ backgroundColor: MEAL_COLORS[t] || '#999' }} />
                  ))}
                </View>
              )}
            </View>
          )
        })}
      </View>

      {/* 选中日期的记录列表 */}
      <ScrollView className='records-section' scrollY>
        {selectedDate ? (
          <>
            <View className='records-header'>
              <Text className='records-date'>{formatDate(selectedDate)}</Text>
              <Text className='records-count'>{selectedDateRecords.length} 条记录</Text>
            </View>
            {selectedDateRecords.length === 0 ? (
              <View className='empty-state'>
                <Text className='empty-text'>当天暂无记录</Text>
              </View>
            ) : (
              selectedDateRecords.map((record) => (
                <View key={record.id} className='record-card' onClick={() => handleRecordClick(record.id)}>
                  <View className='record-top'>
                    <View className='record-tag' style={{ backgroundColor: MEAL_COLORS[record.meal_type] || '#999' }}>
                      <Text className='tag-text'>{MEAL_LABELS[record.meal_type] || record.meal_type}</Text>
                    </View>
                    <Text className='record-period'>{record.meal_period}</Text>
                  </View>
                  <View className='record-body'>
                    <Text className='record-restaurant'>{record.restaurant || '未记录餐厅'}</Text>
                    {record.amount != null && (
                      <Text className='record-amount'>&yen;{record.amount}</Text>
                    )}
                  </View>
                  {record.photos && record.photos.length > 0 && (
                    <View className='record-photos'>
                      {record.photos.slice(0, 3).map((photo, idx) => (
                        <View key={photo.id || idx} className='record-photo-thumb'
                          style={{ backgroundImage: `url(${photo.url})` }}
                        />
                      ))}
                      {record.photos.length > 3 && (
                        <View className='photo-more'>
                          <Text>+{record.photos.length - 3}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              ))
            )}
          </>
        ) : (
          <View className='empty-state'>
            <Text className='empty-text'>点击日期查看记录</Text>
          </View>
        )}
      </ScrollView>

      {/* 月度统计 */}
      {monthlyStats && (
        <View className='stats-section'>
          <View className='stats-header'>
            <Text className='stats-title'>本月统计</Text>
          </View>
          <View className='stats-cards'>
            <View className='stat-card'>
              <Text className='stat-value'>&yen;{monthlyStats.total_amount}</Text>
              <Text className='stat-label'>总金额</Text>
            </View>
            <View className='stat-card'>
              <Text className='stat-value'>{monthlyStats.total_records}</Text>
              <Text className='stat-label'>总记录</Text>
            </View>
            {statMealCounts.map((item) => (
              <View key={item.key} className='stat-card'>
                <Text className='stat-value' style={{ color: item.color }}>{item.count}</Text>
                <Text className='stat-label'>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 浮动添加按钮 */}
      <View className='fab' onClick={handleAddRecord}>
        <Text className='fab-icon'>+</Text>
      </View>

      {/* 底部安全距离 */}
      <View className='safe-bottom' />
    </View>
  )
}