// 用户
export interface User {
  uid: string
  nickname: string
  avatar: string
  points: number
  has_wx: boolean
  has_dy: boolean
  phone: string
  has_phone: boolean
  couple: CoupleInfo | null
  buddy_groups: BuddyGroup[]
  created_at: string
}

export interface LoginResult {
  token: string
  uid: string
  nickname: string
  avatar: string
  is_new: boolean
  need_bind_phone: boolean
  phone: string
}

// 情侣
export interface CoupleInfo {
  id: string
  user1_id: string
  user2_id: string
  status: string
}

// 饭搭子
export interface BuddyGroup {
  id: string
  name: string
  owner_id: string
  max_member: number
  status: string
  created_at: string
}

export interface BuddyMember {
  id: string
  group_id: string
  user_id: string
  role: string // owner / admin / member
  joined_at: string
}

// 餐桌
export type TableType = 'personal' | 'couple' | 'buddy'

export interface TableMember {
  id: string
  table_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  status: string
  joined_at: string
}

export interface Table {
  id: string
  type: TableType
  name: string
  owner_id: string
  status: string
  created_at: string
  updated_at: string
  members: TableMember[]
}

// 菜品
export interface Dish {
  id: string
  owner_id: string
  table_id: string
  dish_type: string // dish / takeout / dineout
  name: string
  category: string
  difficulty: number | null
  duration: number
  price: number | null
  ingredients: Ingredient[] | null
  steps: Step[] | null
  photos: string[] | null
  tags: string[]
  restaurant: string
  restaurant_note: string
  source: string
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface Ingredient {
  name: string
  amount: string
}

export interface Step {
  order: number
  description: string
  image?: string
}

export interface PlazaDish {
  id: string
  name: string
  category: string
  difficulty: number | null
  duration: number
  ingredients: Ingredient[] | null
  steps: Step[] | null
  photos: string[] | null
  tags: string[]
  import_count: number
  created_at: string
}

// 订单
export interface Order {
  id: string
  creator_id: string
  table_id: string
  dine_mode: string // together / solo
  status: string // pending / confirmed / rejected / cancelled / voted
  total_amount: number | null
  vote_deadline?: string | null
  calendar_record_id?: string | null
  order_items: OrderItem[]
  participants?: OrderParticipant[]
  created_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  dish_id: string
  dish_name?: string
  quantity: number
  unit_price: number | null
}

export interface OrderVote {
  id: string
  order_id: string
  user_id: string
  vote: string
  created_at: string
}

export interface OrderParticipant {
  id: string
  order_id: string
  user_id: string
  status: 'invited' | 'accepted' | 'rejected' | 'skipped'
  created_at: string
  updated_at: string
}

// 日历记录
export interface CalendarRecord {
  id: string
  user_id: string
  table_id: string
  record_date: string
  meal_type: string // cook / takeout / dineout
  meal_period: string
  dish_ids: string[]
  restaurant: string
  amount: number | null
  source: string
  status: string
  photos: RecordPhoto[]
  comments: RecordComment[]
  created_at: string
}

export interface RecordPhoto {
  id: string
  record_id: string
  url: string
  type: string // image / video
  sort_order: number
}

export interface RecordComment {
  id: string
  record_id: string
  user_id: string
  content: string
  created_at: string
}

export interface MonthlyStats {
  total_amount: number
  meal_count: Record<string, number>
  total_records: number
  unrecorded_days: string[]
  year: number
  month: number
}

// 心愿
export interface WishItem {
  id: string
  user_id: string
  table_id: string
  name: string
  note: string
  dish_id: string | null
  is_completed: boolean
  created_at: string
}

// 菜篮子
export interface BasketItem {
  id: string
  user_id: string
  table_id: string
  name: string
  quantity: string
  is_purchased: boolean
  created_at: string
}

// 预算
export interface BudgetSetting {
  id: string
  user_id: string
  table_id: string
  month: string
  budget: number
  spent?: number
  created_at?: string
  updated_at?: string
}

// 签到
export interface CheckinStatus {
  today_checked: boolean
  month_count: number
  streak: number
}

// 积分
export interface PointRecord {
  id: string
  user_id: string
  points: number
  reason: string
  created_at: string
}

// 通用响应
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// 分页响应
export interface PaginatedData<T> {
  list: T[]
  total: number
  page: number
  page_size: number
}

export type MaybePaginatedData<T> = PaginatedData<T> | T[]

export type EmptyData = void

export interface ListQueryParams {
  page?: number
  page_size?: number
}

export interface TableQueryParams {
  table_id: string
}

export interface InviteResult {
  code: string
  expires_at: string
}

export interface BuddyGroupSummary {
  id: string
  name: string
}

export interface DishListParams extends ListQueryParams, TableQueryParams {
  dish_type?: string
  category?: string
  keyword?: string
}

export interface DishPayload {
  table_id: string
  dish_type: string
  name: string
  category?: string
  difficulty?: number | null
  duration?: number
  price?: number | null
  ingredients?: Ingredient[]
  steps?: Step[]
  photos?: string[]
  tags?: string[]
  restaurant?: string
  restaurant_note?: string
}

export type DishUpdatePayload = Partial<DishPayload>

export interface PlazaSearchParams extends ListQueryParams {
  category?: string
  keyword?: string
}

export type PlazaCategoriesResponse = string[] & {
  categories?: string[]
}

export interface OrderListParams extends ListQueryParams, TableQueryParams {
  status?: string
}

export interface OrderItemPayload {
  dish_id: string
  quantity: number
  unit_price: number | null
}

export interface CreateOrderPayload {
  table_id: string
  dine_mode: 'solo' | 'together'
  participant_ids?: string[]
  order_items: OrderItemPayload[]
}

export interface OrderVotes {
  approve: number
  reject: number
  skip: number
  total: number
}

export interface CalendarListParams extends TableQueryParams {
  year?: number
  month?: number
  date?: string
}

export interface CalendarRecordPayload {
  table_id: string
  record_date: string
  meal_type: string
  meal_period?: string
  dish_ids?: string[]
  restaurant?: string
  amount?: number | null
  photos?: PhotoPayload[]
  content?: string
}

export interface CalendarRecordUpdatePayload {
  meal_type?: string
  meal_period?: string
  restaurant?: string
  amount?: number | null
}

export interface PhotoPayload {
  url: string
  type: string
}

export interface CreateWishPayload extends TableQueryParams {
  name: string
  note?: string
  dish_id?: string | null
}

export interface BasketPayload extends TableQueryParams {
  name: string
  quantity?: string
}

export interface BudgetPayload extends TableQueryParams {
  month: string
  budget: number
}

export interface CheckinResult {
  points?: number
  checkin_date?: string
  today_checked?: boolean
  month_count?: number
  streak?: number
}

export interface PickerChangeEvent<T extends number | string | number[] | string[] = number | string | number[] | string[]> {
  detail: {
    value: T
  }
}
