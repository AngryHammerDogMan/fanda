import { View, Text, ScrollView, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useMemo, useEffect } from 'react'
import { calendarAPI, tableAPI } from '@/services/api'
import type { CalendarRecord, MonthlyStats, Table } from '@/types'
import { getStoredTableId, getTableDisplayName, rememberTableId } from '@/utils/table'
import './index.scss'

// 美食日历页：按餐桌展示月视图、单日餐食记录与月度金额统计。
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六']
const MEAL_LABELS: Record<string, string> = { cook: '做饭', takeout: '外卖', dineout: '外出' }
const MEAL_COLORS: Record<string, string> = { cook: '#52C41A', takeout: '#FF6B35', dineout: '#1890FF' }
const sticker = (name: string) => `/assets/stickers/${name}.png`

export default function Calendar() {
  const now = new Date()
  // currentYear/currentMonth 控制月视图；selectedDate 保存当前展开的日记录。
  const [currentYear, setCurrentYear] = useState(now.getFullYear())
  const [currentMonth, setCurrentMonth] = useState(now.getMonth() + 1)
  const [selectedDate, setSelectedDate] = useState<string>('')
  // activeTableId 决定日历数据归属。
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [dateRecordsMap, setDateRecordsMap] = useState<Record<string, CalendarRecord[]>>({})
  const [selectedDateRecords, setSelectedDateRecords] = useState<CalendarRecord[]>([])
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null)

  // 日历网格数据：补齐上月尾部和下月开头，保证 UI 始终按完整周渲染。
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

  // 当餐桌或月份变化时加载数据
  useEffect(() => {
    if (activeTableId) {
      loadMonthRecords()
      loadStats()
    }
  }, [activeTableId, currentYear, currentMonth])

  const loadMonthRecords = async () => {
    if (!activeTableId) return
    try {
      const res = await calendarAPI.listByMonth(activeTableId, currentYear, currentMonth)
      const records: CalendarRecord[] = Array.isArray(res.data) ? res.data : res.data?.list || []
      const map: Record<string, CalendarRecord[]> = {}
      // 按日期聚合记录，供日历格子快速判断当天有哪些 meal_type 圆点。
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
    }
  }

  const loadStats = async () => {
    if (!activeTableId) return
    try {
      const res = await calendarAPI.getStats(activeTableId, currentYear, currentMonth)
      setMonthlyStats(res.data)
    } catch (err) {
      console.error('加载统计失败', err)
    }
  }

  const loadDateRecords = async (date: string) => {
    if (!activeTableId) return
    try {
      const res = await calendarAPI.listByDate(activeTableId, date)
      setSelectedDateRecords(Array.isArray(res.data) ? res.data : res.data?.list || [])
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

  const handleTableChange = (tableId: string) => {
    setActiveTableId(tableId)
    rememberTableId(tableId)
    setSelectedDate('')
    setSelectedDateRecords([])
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
      <View className='calendar-hero'>
        <View>
          <Text className='fanda-title'>美食日历</Text>
          <Text className='fanda-subtitle'>把每一顿饭都记成生活账本</Text>
        </View>
        <Image className='hero-sticker' src={sticker('calendar')} mode='aspectFit' />
      </View>

      <View className='budget-banner'>
        <Image className='sticker-icon-sm' src={sticker('budget')} mode='aspectFit' />
        <View className='budget-copy'>
          <Text className='budget-title'>本月餐桌</Text>
          <Text className='budget-desc'>
            {monthlyStats ? `已记录 ${monthlyStats.total_records} 餐 · 合计 ¥${monthlyStats.total_amount}` : '切换餐桌后查看本月记录'}
          </Text>
        </View>
      </View>

      {/* 餐桌选择器 */}
      <View className='group-selector'>
        {tables.map(table => (
          <View
            key={table.id}
            className={`group-tab ${activeTableId === table.id ? 'active' : ''}`}
            onClick={() => handleTableChange(table.id)}
          >
            {getTableDisplayName(table)}
          </View>
        ))}
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
