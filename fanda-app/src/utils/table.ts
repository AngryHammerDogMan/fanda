import Taro from '@tarojs/taro'
import type { Table } from '@/types'

// 最近使用餐桌缓存 key：点单、预算、心愿、菜篮子等页面共享同一选择偏好。
export const LAST_ORDER_TABLE_KEY = 'last-order-table-id'

export const getPrimaryTable = (tables: Table[]): Table | null => {
  // 优先使用个人/情侣餐桌作为默认餐桌，没有时回退到列表第一项。
  return tables.find(table => table.type === 'personal' || table.type === 'couple') || tables[0] || null
}

export const getTableDisplayName = (table: Table | null): string => {
  // 展示名缺失时按餐桌类型提供兜底名称，避免页面出现空标题。
  if (!table) return '我的餐桌'
  return table.name || (table.type === 'couple' ? '情侣餐桌' : table.type === 'personal' ? '我的餐桌' : '饭搭餐桌')
}

export const getStoredTableId = (tables: Table[]): string => {
  // 仅当缓存餐桌仍存在于当前列表时复用，避免切换账号/餐桌后命中过期 ID。
  const lastTableId = Taro.getStorageSync(LAST_ORDER_TABLE_KEY)
  if (typeof lastTableId === 'string' && tables.some(table => table.id === lastTableId)) {
    return lastTableId
  }
  return getPrimaryTable(tables)?.id || ''
}

export const rememberTableId = (tableId: string): void => {
  // 空餐桌 ID 不写入缓存，防止覆盖已有可用选择。
  if (tableId) {
    Taro.setStorageSync(LAST_ORDER_TABLE_KEY, tableId)
  }
}
