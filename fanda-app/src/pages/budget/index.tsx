import { View, Text, Input, Picker } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { authAPI, featureAPI, calendarAPI } from '@/services/api'
import type { User, BudgetSetting, MonthlyStats, BuddyGroup } from '@/types'
import './index.scss'

export default function Budget() {
  const [user, setUser] = useState<User | null>(null)
  const [groupType, setGroupType] = useState('couple')
  const [groupId, setGroupId] = useState('')
  const [groups, setGroups] = useState<BuddyGroup[]>([])
  const [budget, setBudget] = useState<BudgetSetting | null>(null)
  const [stats, setStats] = useState<MonthlyStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [showSetForm, setShowSetForm] = useState(false)
  const [budgetAmount, setBudgetAmount] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)

  useDidShow(() => {
    loadUser()
  })

  const currentMonth = `${year}-${String(month).padStart(2, '0')}`

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

  const loadData = async () => {
    if (!groupType || !groupId) return
    setLoading(true)
    try {
      const [budgetRes, statsRes] = await Promise.all([
        featureAPI.getBudget(groupType, groupId, currentMonth),
        calendarAPI.getStats(groupType, groupId, year, month),
      ])
      setBudget(budgetRes.data || null)
      setStats(statsRes.data || null)
    } catch (err) {
      console.error('加载预算数据失败', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (groupType && groupId) {
      loadData()
    }
  }, [groupType, groupId, year, month])

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

  const handleMonthChange = (e: any) => {
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
    if (isNaN(amount) || amount <= 0) {
      Taro.showToast({ title: '请输入有效的预算金额', icon: 'none' })
      return
    }
    try {
      await featureAPI.setBudget({
        group_type: groupType,
        group_id: groupId,
        month: currentMonth,
        budget: amount,
      })
      Taro.showToast({ title: '预算设置成功', icon: 'success' })
      setBudgetAmount('')
      setShowSetForm(false)
      loadData()
    } catch (err: any) {
      Taro.showToast({ title: err.message || '设置失败', icon: 'none' })
    }
  }

  const budgetAmount_value = budget?.budget || 0
  const spentAmount = stats?.total_amount || 0
  const remaining = budgetAmount_value - spentAmount
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