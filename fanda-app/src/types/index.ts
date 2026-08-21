import type { components, operations } from './generated-api'

type GeneratedApiResponse<T = unknown> = import('./generated-api').ApiResponse<T>
type GeneratedPaginatedData<T> = import('./generated-api').PaginatedData<T>

export type User = components['schemas']['User']
export type LoginResult = components['schemas']['LoginResult']

export type CoupleInfo = components['schemas']['CoupleInfo']
export type BuddyGroup = components['schemas']['BuddyGroup']
export type BuddyMember = components['schemas']['BuddyMember']

export type TableType = Table['type']
export type TableMember = components['schemas']['TableMember']
export type Table = components['schemas']['Table']

export type Dish = components['schemas']['Dish']
export type Ingredient = components['schemas']['Ingredient']
export type Step = components['schemas']['Step']
export type PlazaDish = components['schemas']['PlazaDish']

export type Order = components['schemas']['Order']
export type OrderItem = components['schemas']['OrderItem']
export type OrderVote = components['schemas']['OrderVote']
export type OrderParticipant = components['schemas']['OrderParticipant']

export type CalendarRecord = components['schemas']['CalendarRecord']
export type CalendarOrder = components['schemas']['CalendarOrder']
export type CalendarOrderItem = components['schemas']['CalendarOrderItem']
export type CalendarRecordUpdateOrderItem = components['schemas']['CalendarRecordUpdateOrderItem']
export type RecordPhoto = components['schemas']['RecordPhoto']
export type RecordComment = components['schemas']['RecordComment']
export type MonthlyStats = components['schemas']['MonthlyStats']

export type WishItem = components['schemas']['WishItem']
export type BasketItem = components['schemas']['BasketItem']
export type BudgetSetting = components['schemas']['BudgetSetting']
export type CheckinStatus = components['schemas']['CheckinStatus']
export type PointRecord = components['schemas']['PointRecord']

export type ApiResponse<T = unknown> = GeneratedApiResponse<T>
export type PaginatedData<T> = GeneratedPaginatedData<T>
export type MaybePaginatedData<T> = PaginatedData<T> | T[]
export type EmptyData = void

export type ListQueryParams = {
  page?: number
  page_size?: number
}
export type TableQueryParams = {
  table_id: string
}

export type InviteResult = components['schemas']['InviteResult']
export type BuddyGroupSummary = components['schemas']['BuddyGroupSummary']

export type DishListParams = operations['listDishes']['parameters']['query']
export type DishPayload = operations['createDish']['requestBody']
export type DishUpdatePayload = operations['updateDish']['requestBody']

export type PlazaSearchParams = operations['searchPlaza']['parameters']['query']
export type PlazaCategoriesResponse = string[]

export type OrderListParams = operations['listOrders']['parameters']['query']
export type OrderItemPayload = components['schemas']['OrderItemPayload']
export type OrderBasketItemPayload = components['schemas']['OrderBasketItemPayload']
export type CreateOrderPayload = operations['createOrder']['requestBody']
export type OrderVotes = components['schemas']['OrderVotes']

export type CalendarListParams = (
  operations['listCalendarRecords']['parameters']['query']
  | operations['listCalendarRecordsByDate']['parameters']['query']
)
export type CalendarRecordPayload = operations['createCalendarRecord']['requestBody']
export type CalendarRecordUpdatePayload = operations['updateCalendarRecord']['requestBody']
export type PhotoPayload = components['schemas']['PhotoPayload']

export type CreateWishPayload = operations['createWish']['requestBody']
export type BasketPayload = operations['addToBasket']['requestBody']
export type BudgetPayload = operations['setBudget']['requestBody']
export type CheckinResult = components['schemas']['CheckinResult']

export type PickerChangeEvent<T extends number | string | number[] | string[] = number | string | number[] | string[]> = {
  detail: {
    value: T
  }
}
