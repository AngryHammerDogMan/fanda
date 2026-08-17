import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect, useCallback } from 'react'
import { featureAPI, calendarAPI, tableAPI } from '@/services/api'
import type { BudgetSetting, MonthlyStats, PickerChangeEvent, Table } from '@/types'
import { getErrorMessage } from '@/utils/error'
import { getStoredTableId, getTableDisplayName, rememberTableId } from '@/utils/table'
import './index.scss'

// 预算页：按餐桌与月份展示餐饮预算、实际支出、剩余额度和月度餐食统计。
export default function Budget() {
  // activeTableId/month 共同组成预算与统计查询维度。
  const [tables, setTables] = useState<Table[]>([])
  const [activeTableId, setActiveTableId] = useState('')
  const [budget, setBudget] = useState<BudgetSetting | null>(null)
  const [stats, setStats] = useState<MonthlyStats | null>(null)
  const [showSetForm, setShowSetForm] = useState(false)
  const [budgetAmount, setBudgetAmount] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  useDidShow(() => {
    loadTables()
  })

  const currentMonth = `${year}-${String(month).padStart(2, '0')}`

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

  const loadData = useCallback(async () => {
    if (!activeTableId) return
    try {
      // 预算设置和日历统计独立返回，并发请求后在本页合并计算进度。
      const [budgetRes, statsRes] = await Promise.all([
        featureAPI.getBudget(activeTableId, currentMonth),
        calendarAPI.getStats(activeTableId, year, month),
      ])
      setBudget(budgetRes.data || null)
      setStats(statsRes.data || null)
    } catch (err) {
      console.error('加载预算数据失败', err)
    }
  }, [activeTableId, currentMonth, month, year])

  useEffect(() => {
    if (activeTableId) {
      loadData()
    }
  }, [activeTableId, year, month, loadData])

  const handleTableChange = (tableId: string) => {
    setActiveTableId(tableId)
    rememberTableId(tableId)
  }

  const handleMonthChange = (e: PickerChangeEvent<string>) => {
    const val = e.detail.value // 'YYYY-MM'
    const [y, m] = val.split('-')
    setYear(parseInt(y))
    setMonth(parseInt(m))
  }

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
    } else {
      setMonth(month - 1)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
    } else {
      setMonth(month + 1)
    }
  }

  const handleSetBudget = async () => {
    const amount = parseFloat(budgetAmount)
    if (Number.isNaN(amount) || amount <= 0) {
      Taro.showToast({ title: '请输入有效的预算金额', icon: 'none' })
      return
    }
    try {
      await featureAPI.setBudget({
        table_id: activeTableId,
        month: currentMonth,
        budget: amount,
      })
      Taro.showToast({ title: '预算设置成功', icon: 'success' })
      setBudgetAmount('')
      setShowSetForm(false)
      loadData()
    } catch (err: unknown) {
      Taro.showToast({ title: getErrorMessage(err, '设置失败'), icon: 'none' })
    }
  }

  const budgetAmount_value = budget?.budget || 0
  const spentAmount = stats?.total_amount || 0
  const remaining = budgetAmount_value - spentAmount
  // 进度条最多展示到 100%，超预算时通过剩余金额和颜色表达溢出。
  const percent = budgetAmount_value > 0 ? Math.min((spentAmount / budgetAmount_value) * 100, 100) : 0

  const getPercentColor = () => {
    if (percent >= 100) return 'var(--color-danger)'
    if (percent >= 80) return 'var(--color-warning)'
    return 'var(--color-success)'
  }

  const mealNames: Record<string, string> = {
    cook: '做饭',
    takeout: '外卖',
    dineout: '外出就餐',
  }

  return (
    <View className='page-budget'>
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

      {/* 月份选择器 */}
      <View className='month-picker'>
        <View className='month-arrow' onClick={handlePrevMonth}>
          <Text className='arrow-text'>&lt;</Text>
        </View>
        <Picker mode='date' fields='month' value={currentMonth} onChange={handleMonthChange}>
          <View className='month-display'>
            <Text className='month-text'>{year}年{month}月</Text>
          </View>
        </Picker>
        <View className='month-arrow' onClick={handleNextMonth}>
          <Text className='arrow-text'>&gt;</Text>
        </View>
      </View>

      {/* 预算概览 */}
      <View className='budget-overview'>
        <View className='overview-card'>
          <Text className='overview-label'>月度预算</Text>
          <Text className='overview-value budget-amount'>¥{budgetAmount_value.toFixed(2)}</Text>
        </View>
        <View className='overview-card'>
          <Text className='overview-label'>已支出</Text>
          <Text className='overview-value spent'>¥{spentAmount.toFixed(2)}</Text>
        </View>
        <View className='overview-card'>
          <Text className='overview-label'>剩余</Text>
          <Text className={`overview-value ${remaining >= 0 ? 'remaining' : 'over'}`}>
            ¥{remaining.toFixed(2)}
          </Text>
        </View>
      </View>

      {/* 进度条 */}
      {budgetAmount_value > 0 && (
        <View className='progress-section'>
          <View className='progress-header'>
            <Text className='progress-label'>预算使用进度</Text>
            <Text className='progress-percent'>{percent.toFixed(0)}%</Text>
          </View>
          <View className='progress-bar'>
            <View
              className='progress-fill'
              style={{ width: `${percent}%`, background: getPercentColor() }}
            />
          </View>
        </View>
      )}

      {/* 月度统计 */}
      {stats && (
        <View className='stats-section'>
          <View className='section-title'>本月统计</View>
          <View className='stats-grid'>
            <View className='stat-card'>
              <Text className='stat-value'>{stats.total_records}</Text>
              <Text className='stat-label'>记录数</Text>
            </View>
            {Object.entries(stats.meal_count || {}).map(([key, count]) => (
              <View key={key} className='stat-card'>
                <Text className='stat-value'>{count}</Text>
                <Text className='stat-label'>{mealNames[key] || key}</Text>
              </View>
            ))}
          </View>
          {stats.unrecorded_days && stats.unrecorded_days.length > 0 && (
            <View className='unrecorded-card'>
              <Text className='unrecorded-label'>未记录日期：</Text>
              <Text className='unrecorded-days'>
                {stats.unrecorded_days.slice(0, 10).join('、')}
                {stats.unrecorded_days.length > 10 ? '...' : ''}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* 设置预算 */}
      <View className='bottom-section'>
        {showSetForm ? (
          <View className='set-form'>
            <View className='set-form-row'>
              <Text className='set-form-label'>¥</Text>
              <Input
                className='set-form-input'
                type='digit'
                placeholder='输入预算金额'
                value={budgetAmount}
                onInput={e => setBudgetAmount(e.detail.value)}
                focus
              />
            </View>
            <View className='set-form-actions'>
              <View className='set-cancel-btn' onClick={() => { setShowSetForm(false); setBudgetAmount('') }}>
                <Text>取消</Text>
              </View>
              <View className='set-confirm-btn' onClick={handleSetBudget}>
                <Text>保存</Text>
              </View>
            </View>
          </View>
        ) : (
          <View className='set-btn' onClick={() => setShowSetForm(true)}>
            <Text className='set-btn-text'>{budget ? '修改预算' : '设置预算'}</Text>
          </View>
        )}
      </View>
    </View>
  )
}
