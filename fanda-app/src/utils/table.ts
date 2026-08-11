import Taro from '@tarojs/taro'
import type { Table } from '@/types'

export const LAST_ORDER_TABLE_KEY = 'last-order-table-id'

export const getPrimaryTable = (tables: Table[]): Table | null => {
  return tables.find(table => table.type === 'personal' || table.type === 'couple') || tables[0] || null
}

export const getTableDisplayName = (table: Table | null): string => {
  if (!table) return '我的餐桌'
  return table.name || (table.type === 'couple' ? '情侣餐桌' : table.type === 'personal' ? '我的餐桌' : '饭搭餐桌')
}

export const getStoredTableId = (tables: Table[]): string => {
  const lastTableId = Taro.getStorageSync(LAST_ORDER_TABLE_KEY)
  if (typeof lastTableId === 'string' && tables.some(table => table.id === lastTableId)) {
    return lastTableId
  }
  return getPrimaryTable(tables)?.id || ''
}

export const rememberTableId = (tableId: string): void => {
  if (tableId) {
    Taro.setStorageSync(LAST_ORDER_TABLE_KEY, tableId)
  }
}
