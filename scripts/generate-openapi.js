const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const openapiPath = path.join(rootDir, 'docs/openapi.json')
const generatedApiPath = path.join(rootDir, 'fanda-app/src/types/generated-api.ts')

const stringSchema = () => ({ type: 'string' })
const dateSchema = () => ({ type: 'string', format: 'date' })
const dateTimeSchema = () => ({ type: 'string', format: 'date-time' })
const uuidSchema = () => ({ type: 'string', format: 'uuid' })
const numberSchema = () => ({ type: 'number' })
const integerSchema = () => ({ type: 'integer' })
const booleanSchema = () => ({ type: 'boolean' })
const nullable = (schema) => ({ ...schema, nullable: true })
const emptySchema = () => ({ type: 'object', nullable: true })
const arrayOf = (items) => ({ type: 'array', items })
const ref = (name) => ({ $ref: `#/components/schemas/${name}` })

const objectSchema = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
})

const apiResponse = (schema) => objectSchema({
  code: integerSchema(),
  message: stringSchema(),
  data: schema,
})

const paginated = (itemSchema) => objectSchema({
  list: arrayOf(itemSchema),
  total: integerSchema(),
  page: integerSchema(),
  page_size: integerSchema(),
})

const bearer = [{ bearerAuth: [] }]
const jsonBody = (schema) => ({
  required: true,
  content: {
    'application/json': {
      schema,
    },
  },
})
const jsonResponse = (schema) => ({
  description: 'OK',
  content: {
    'application/json': {
      schema,
    },
  },
})
const query = (name, schema, required = false) => ({
  name,
  in: 'query',
  required,
  schema,
})
const pathParam = (name) => ({
  name,
  in: 'path',
  required: true,
  schema: uuidSchema(),
})

const schemas = {
  LoginPayload: objectSchema({
    code: stringSchema(),
    platform: { type: 'string', enum: ['wechat', 'douyin'] },
  }),
  LoginResult: objectSchema({
    token: stringSchema(),
    uid: uuidSchema(),
    nickname: stringSchema(),
    avatar: stringSchema(),
    is_new: booleanSchema(),
    need_bind_phone: booleanSchema(),
    phone: stringSchema(),
  }),
  ProfileUpdatePayload: objectSchema({
    nickname: stringSchema(),
    avatar: stringSchema(),
  }, ['nickname', 'avatar']),
  CoupleInfo: objectSchema({
    id: uuidSchema(),
    user1_id: uuidSchema(),
    user2_id: uuidSchema(),
    status: stringSchema(),
  }),
  BuddyGroup: objectSchema({
    id: uuidSchema(),
    name: stringSchema(),
    owner_id: uuidSchema(),
    max_member: integerSchema(),
    status: stringSchema(),
    created_at: dateTimeSchema(),
  }),
  BuddyMember: objectSchema({
    id: uuidSchema(),
    group_id: uuidSchema(),
    user_id: uuidSchema(),
    role: { type: 'string', enum: ['owner', 'admin', 'member'] },
    joined_at: dateTimeSchema(),
  }),
  User: objectSchema({
    uid: uuidSchema(),
    nickname: stringSchema(),
    avatar: stringSchema(),
    points: integerSchema(),
    has_wx: booleanSchema(),
    has_dy: booleanSchema(),
    phone: stringSchema(),
    has_phone: booleanSchema(),
    couple: nullable(ref('CoupleInfo')),
    buddy_groups: arrayOf(ref('BuddyGroup')),
    created_at: dateTimeSchema(),
  }),
  InviteResult: objectSchema({
    code: stringSchema(),
    expires_at: dateTimeSchema(),
  }),
  BuddyGroupSummary: objectSchema({
    id: uuidSchema(),
    name: stringSchema(),
  }),
  CreateBuddyGroupPayload: objectSchema({ name: stringSchema() }),
  JoinInvitePayload: objectSchema({ code: stringSchema() }),
  TableMember: objectSchema({
    id: uuidSchema(),
    table_id: uuidSchema(),
    user_id: uuidSchema(),
    role: { type: 'string', enum: ['owner', 'admin', 'member'] },
    status: stringSchema(),
    joined_at: dateTimeSchema(),
  }),
  Table: objectSchema({
    id: uuidSchema(),
    type: { type: 'string', enum: ['personal', 'couple', 'buddy'] },
    name: stringSchema(),
    owner_id: uuidSchema(),
    status: stringSchema(),
    created_at: dateTimeSchema(),
    updated_at: dateTimeSchema(),
    members: arrayOf(ref('TableMember')),
  }),
  RenameTablePayload: objectSchema({ name: stringSchema() }),
  Ingredient: objectSchema({
    name: stringSchema(),
    amount: stringSchema(),
  }),
  Step: objectSchema({
    order: integerSchema(),
    description: stringSchema(),
    image: stringSchema(),
  }, ['order', 'description']),
  Dish: objectSchema({
    id: uuidSchema(),
    owner_id: uuidSchema(),
    table_id: uuidSchema(),
    dish_type: { type: 'string', enum: ['dish', 'takeout', 'dineout'] },
    name: stringSchema(),
    category: stringSchema(),
    difficulty: nullable(integerSchema()),
    duration: integerSchema(),
    price: nullable(numberSchema()),
    ingredients: nullable(arrayOf(ref('Ingredient'))),
    steps: nullable(arrayOf(ref('Step'))),
    photos: nullable(arrayOf(stringSchema())),
    tags: arrayOf(stringSchema()),
    restaurant: stringSchema(),
    restaurant_note: stringSchema(),
    source: { type: 'string', enum: ['manual', 'plaza'] },
    is_deleted: booleanSchema(),
    created_at: dateTimeSchema(),
    updated_at: dateTimeSchema(),
  }),
  DishPayload: objectSchema({
    table_id: uuidSchema(),
    dish_type: { type: 'string', enum: ['dish', 'takeout', 'dineout'] },
    name: stringSchema(),
    category: stringSchema(),
    difficulty: nullable(integerSchema()),
    duration: integerSchema(),
    price: nullable(numberSchema()),
    ingredients: arrayOf(ref('Ingredient')),
    steps: arrayOf(ref('Step')),
    photos: arrayOf(stringSchema()),
    tags: arrayOf(stringSchema()),
    restaurant: stringSchema(),
    restaurant_note: stringSchema(),
  }, ['table_id', 'dish_type', 'name']),
  DishUpdatePayload: objectSchema({
    name: stringSchema(),
    category: stringSchema(),
    difficulty: nullable(integerSchema()),
    duration: integerSchema(),
    price: nullable(numberSchema()),
    ingredients: arrayOf(ref('Ingredient')),
    steps: arrayOf(ref('Step')),
    photos: arrayOf(stringSchema()),
    tags: arrayOf(stringSchema()),
    restaurant: stringSchema(),
    restaurant_note: stringSchema(),
  }, []),
  ImportDishPayload: objectSchema({
    plaza_id: uuidSchema(),
    table_id: uuidSchema(),
  }),
  PlazaDish: objectSchema({
    id: uuidSchema(),
    name: stringSchema(),
    category: stringSchema(),
    difficulty: nullable(integerSchema()),
    duration: integerSchema(),
    ingredients: nullable(arrayOf(ref('Ingredient'))),
    steps: nullable(arrayOf(ref('Step'))),
    photos: nullable(arrayOf(stringSchema())),
    tags: arrayOf(stringSchema()),
    import_count: integerSchema(),
    created_at: dateTimeSchema(),
  }),
  OrderItem: objectSchema({
    id: uuidSchema(),
    order_id: uuidSchema(),
    dish_id: uuidSchema(),
    dish_name: stringSchema(),
    quantity: integerSchema(),
    unit_price: nullable(numberSchema()),
  }, ['id', 'order_id', 'dish_id', 'quantity', 'unit_price']),
  OrderParticipant: objectSchema({
    id: uuidSchema(),
    order_id: uuidSchema(),
    user_id: uuidSchema(),
    status: { type: 'string', enum: ['invited', 'accepted', 'rejected', 'skipped'] },
    created_at: dateTimeSchema(),
    updated_at: dateTimeSchema(),
  }),
  Order: objectSchema({
    id: uuidSchema(),
    creator_id: uuidSchema(),
    table_id: uuidSchema(),
    dine_mode: { type: 'string', enum: ['together', 'solo'] },
    status: { type: 'string', enum: ['pending', 'confirmed', 'rejected', 'cancelled', 'voted'] },
    total_amount: nullable(numberSchema()),
    vote_deadline: nullable(dateTimeSchema()),
    calendar_record_id: nullable(uuidSchema()),
    order_items: arrayOf(ref('OrderItem')),
    participants: arrayOf(ref('OrderParticipant')),
    created_at: dateTimeSchema(),
  }, ['id', 'creator_id', 'table_id', 'dine_mode', 'status', 'total_amount', 'order_items', 'created_at']),
  OrderVote: objectSchema({
    id: uuidSchema(),
    order_id: uuidSchema(),
    user_id: uuidSchema(),
    vote: { type: 'string', enum: ['approve', 'reject', 'skip'] },
    created_at: dateTimeSchema(),
  }),
  OrderItemPayload: objectSchema({
    dish_id: uuidSchema(),
    quantity: integerSchema(),
    unit_price: nullable(numberSchema()),
  }),
  OrderBasketItemPayload: objectSchema({
    name: stringSchema(),
    quantity: stringSchema(),
  }),
  CreateOrderPayload: objectSchema({
    table_id: uuidSchema(),
    dine_mode: { type: 'string', enum: ['solo', 'together'] },
    participant_ids: arrayOf(uuidSchema()),
    items: arrayOf(ref('OrderItemPayload')),
    basket_items: arrayOf(ref('OrderBasketItemPayload')),
  }, ['table_id', 'dine_mode', 'items']),
  VoteOrderPayload: objectSchema({
    vote: { type: 'string', enum: ['approve', 'reject', 'skip'] },
  }),
  OrderVotes: objectSchema({
    approve: integerSchema(),
    reject: integerSchema(),
    skip: integerSchema(),
    total: integerSchema(),
    votes: arrayOf(ref('OrderVote')),
  }),
  RecordPhoto: objectSchema({
    id: uuidSchema(),
    record_id: uuidSchema(),
    url: stringSchema(),
    type: stringSchema(),
    sort_order: integerSchema(),
  }),
  RecordComment: objectSchema({
    id: uuidSchema(),
    record_id: uuidSchema(),
    user_id: uuidSchema(),
    content: stringSchema(),
    created_at: dateTimeSchema(),
  }),
  CalendarRecord: objectSchema({
    id: uuidSchema(),
    user_id: uuidSchema(),
    table_id: uuidSchema(),
    record_date: stringSchema(),
    meal_type: stringSchema(),
    meal_period: stringSchema(),
    dish_ids: arrayOf(uuidSchema()),
    restaurant: stringSchema(),
    amount: nullable(numberSchema()),
    source: stringSchema(),
    status: stringSchema(),
    photos: arrayOf(ref('RecordPhoto')),
    comments: arrayOf(ref('RecordComment')),
    created_at: dateTimeSchema(),
  }),
  PhotoPayload: objectSchema({
    url: stringSchema(),
    type: stringSchema(),
  }),
  CalendarRecordPayload: objectSchema({
    table_id: uuidSchema(),
    record_date: stringSchema(),
    meal_type: stringSchema(),
    meal_period: stringSchema(),
    dish_ids: arrayOf(uuidSchema()),
    restaurant: stringSchema(),
    amount: nullable(numberSchema()),
    photos: arrayOf(ref('PhotoPayload')),
    content: stringSchema(),
  }, ['table_id', 'record_date', 'meal_type']),
  CalendarRecordUpdatePayload: objectSchema({
    meal_type: stringSchema(),
    meal_period: stringSchema(),
    restaurant: stringSchema(),
    amount: nullable(numberSchema()),
  }, []),
  MonthlyStats: objectSchema({
    total_amount: numberSchema(),
    meal_count: { type: 'object', additionalProperties: integerSchema() },
    total_records: integerSchema(),
    unrecorded_days: arrayOf(stringSchema()),
    year: integerSchema(),
    month: integerSchema(),
  }),
  WishItem: objectSchema({
    id: uuidSchema(),
    user_id: uuidSchema(),
    table_id: uuidSchema(),
    name: stringSchema(),
    note: stringSchema(),
    dish_id: nullable(uuidSchema()),
    is_completed: booleanSchema(),
    created_at: dateTimeSchema(),
  }),
  CreateWishPayload: objectSchema({
    table_id: uuidSchema(),
    name: stringSchema(),
    note: stringSchema(),
    dish_id: nullable(uuidSchema()),
  }, ['table_id', 'name']),
  CheckinStatus: objectSchema({
    today_checked: booleanSchema(),
    month_count: integerSchema(),
    streak: integerSchema(),
  }),
  CheckinResult: objectSchema({
    points: integerSchema(),
    checkin_date: stringSchema(),
    today_checked: booleanSchema(),
    month_count: integerSchema(),
    streak: integerSchema(),
  }, []),
  BasketItem: objectSchema({
    id: uuidSchema(),
    user_id: uuidSchema(),
    table_id: uuidSchema(),
    name: stringSchema(),
    quantity: stringSchema(),
    is_purchased: booleanSchema(),
    created_at: dateTimeSchema(),
  }),
  BasketPayload: objectSchema({
    table_id: uuidSchema(),
    name: stringSchema(),
    quantity: stringSchema(),
  }, ['table_id', 'name']),
  BudgetSetting: objectSchema({
    id: uuidSchema(),
    user_id: uuidSchema(),
    table_id: uuidSchema(),
    month: stringSchema(),
    budget: numberSchema(),
    spent: numberSchema(),
    created_at: dateTimeSchema(),
    updated_at: dateTimeSchema(),
  }, ['id', 'user_id', 'table_id', 'month', 'budget']),
  BudgetPayload: objectSchema({
    table_id: uuidSchema(),
    month: stringSchema(),
    budget: numberSchema(),
  }),
  PointRecord: objectSchema({
    id: uuidSchema(),
    user_id: uuidSchema(),
    points: integerSchema(),
    reason: stringSchema(),
    created_at: dateTimeSchema(),
  }),
}

const makeOperation = ({ operationId, summary, security = bearer, parameters = [], requestBody, dataSchema }) => {
  const operation = {
    operationId,
    summary,
    security,
    parameters,
    responses: {
      200: jsonResponse(apiResponse(dataSchema)),
    },
  }
  if (requestBody) {
    operation.requestBody = jsonBody(requestBody)
  }
  return operation
}

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Fanda API',
    version: '1.0.0',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas,
  },
  paths: Object.fromEntries(Object.entries({
    '/api/v1/auth/login': {
      post: makeOperation({ operationId: 'authLogin', summary: '平台登录', security: [], requestBody: ref('LoginPayload'), dataSchema: ref('LoginResult') }),
    },
    '/api/v1/auth/profile': {
      get: makeOperation({ operationId: 'getProfile', summary: '获取当前用户资料', dataSchema: ref('User') }),
      put: makeOperation({ operationId: 'updateProfile', summary: '更新用户资料', requestBody: ref('ProfileUpdatePayload'), dataSchema: emptySchema() }),
    },
    '/api/v1/auth/bind-phone': {
      post: makeOperation({ operationId: 'bindPhone', summary: '绑定手机号', requestBody: objectSchema({ phone: stringSchema() }), dataSchema: emptySchema() }),
    },
    '/api/v1/couple/invite': {
      post: makeOperation({ operationId: 'createCoupleInvite', summary: '创建情侣邀请码', dataSchema: ref('InviteResult') }),
    },
    '/api/v1/couple/join': {
      post: makeOperation({ operationId: 'joinCouple', summary: '加入情侣关系', requestBody: ref('JoinInvitePayload'), dataSchema: emptySchema() }),
    },
    '/api/v1/buddy/groups': {
      post: makeOperation({ operationId: 'createBuddyGroup', summary: '创建饭搭子组合', requestBody: ref('CreateBuddyGroupPayload'), dataSchema: ref('BuddyGroupSummary') }),
    },
    '/api/v1/buddy/groups/{id}/invite': {
      post: makeOperation({ operationId: 'createBuddyInvite', summary: '创建饭搭子邀请码', parameters: [pathParam('id')], dataSchema: ref('InviteResult') }),
    },
    '/api/v1/buddy/groups/{id}/join': {
      post: makeOperation({ operationId: 'joinBuddyGroup', summary: '加入饭搭子组合', parameters: [pathParam('id')], requestBody: ref('JoinInvitePayload'), dataSchema: emptySchema() }),
    },
    '/api/v1/buddy/groups/{id}/members/{uid}': {
      delete: makeOperation({ operationId: 'removeBuddyMember', summary: '移除饭搭子成员', parameters: [pathParam('id'), pathParam('uid')], dataSchema: emptySchema() }),
    },
    '/api/v1/tables': {
      get: makeOperation({ operationId: 'listTables', summary: '列出餐桌', dataSchema: arrayOf(ref('Table')) }),
    },
    '/api/v1/tables/{id}': {
      put: makeOperation({ operationId: 'renameTable', summary: '重命名餐桌', parameters: [pathParam('id')], requestBody: ref('RenameTablePayload'), dataSchema: ref('Table') }),
    },
    '/api/v1/dishes': {
      get: makeOperation({
        operationId: 'listDishes',
        summary: '列出菜品',
        parameters: [query('table_id', uuidSchema(), true), query('dish_type', stringSchema()), query('category', stringSchema()), query('keyword', stringSchema()), query('page', integerSchema()), query('page_size', integerSchema())],
        dataSchema: paginated(ref('Dish')),
      }),
      post: makeOperation({ operationId: 'createDish', summary: '创建菜品', requestBody: ref('DishPayload'), dataSchema: ref('Dish') }),
    },
    '/api/v1/dishes/{id}': {
      get: makeOperation({ operationId: 'getDish', summary: '获取菜品', parameters: [pathParam('id')], dataSchema: ref('Dish') }),
      put: makeOperation({ operationId: 'updateDish', summary: '更新菜品', parameters: [pathParam('id')], requestBody: ref('DishUpdatePayload'), dataSchema: emptySchema() }),
      delete: makeOperation({ operationId: 'deleteDish', summary: '删除菜品', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/dishes/import': {
      post: makeOperation({ operationId: 'importDish', summary: '从学菜广场导入', requestBody: ref('ImportDishPayload'), dataSchema: ref('Dish') }),
    },
    '/api/v1/plaza': {
      get: makeOperation({
        operationId: 'searchPlaza',
        summary: '搜索学菜广场',
        parameters: [query('category', stringSchema()), query('keyword', stringSchema()), query('page', integerSchema()), query('page_size', integerSchema())],
        dataSchema: paginated(ref('PlazaDish')),
      }),
    },
    '/api/v1/plaza/categories': {
      get: makeOperation({ operationId: 'getPlazaCategories', summary: '获取广场分类', dataSchema: arrayOf(stringSchema()) }),
    },
    '/api/v1/orders': {
      get: makeOperation({
        operationId: 'listOrders',
        summary: '列出订单',
        parameters: [query('table_id', uuidSchema(), true), query('status', stringSchema()), query('page', integerSchema()), query('page_size', integerSchema())],
        dataSchema: paginated(ref('Order')),
      }),
      post: makeOperation({ operationId: 'createOrder', summary: '创建订单', requestBody: ref('CreateOrderPayload'), dataSchema: ref('Order') }),
    },
    '/api/v1/orders/{id}': {
      get: makeOperation({ operationId: 'getOrder', summary: '获取订单', parameters: [pathParam('id')], dataSchema: ref('Order') }),
    },
    '/api/v1/orders/{id}/confirm': {
      post: makeOperation({ operationId: 'confirmOrder', summary: '确认订单', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/orders/{id}/reject': {
      post: makeOperation({ operationId: 'rejectOrder', summary: '拒绝订单', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/orders/{id}/cancel': {
      post: makeOperation({ operationId: 'cancelOrder', summary: '取消订单', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/orders/{id}/vote': {
      post: makeOperation({ operationId: 'voteOrder', summary: '订单投票', parameters: [pathParam('id')], requestBody: ref('VoteOrderPayload'), dataSchema: emptySchema() }),
    },
    '/api/v1/orders/{id}/votes': {
      get: makeOperation({ operationId: 'getOrderVotes', summary: '订单投票结果', parameters: [pathParam('id')], dataSchema: ref('OrderVotes') }),
    },
    '/api/v1/calendar/records': {
      get: makeOperation({
        operationId: 'listCalendarRecords',
        summary: '按月列出日历记录',
        parameters: [query('table_id', uuidSchema(), true), query('year', integerSchema()), query('month', integerSchema())],
        dataSchema: arrayOf(ref('CalendarRecord')),
      }),
      post: makeOperation({ operationId: 'createCalendarRecord', summary: '创建日历记录', requestBody: ref('CalendarRecordPayload'), dataSchema: ref('CalendarRecord') }),
    },
    '/api/v1/calendar/records/date': {
      get: makeOperation({
        operationId: 'listCalendarRecordsByDate',
        summary: '按日期列出日历记录',
        parameters: [query('table_id', uuidSchema(), true), query('date', dateSchema(), true)],
        dataSchema: arrayOf(ref('CalendarRecord')),
      }),
    },
    '/api/v1/calendar/records/{id}': {
      get: makeOperation({ operationId: 'getCalendarRecord', summary: '获取日历记录', parameters: [pathParam('id')], dataSchema: ref('CalendarRecord') }),
      put: makeOperation({ operationId: 'updateCalendarRecord', summary: '更新日历记录', parameters: [pathParam('id')], requestBody: ref('CalendarRecordUpdatePayload'), dataSchema: emptySchema() }),
      delete: makeOperation({ operationId: 'deleteCalendarRecord', summary: '删除日历记录', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/calendar/records/{id}/comments': {
      post: makeOperation({ operationId: 'addRecordComment', summary: '新增记录留言', parameters: [pathParam('id')], requestBody: objectSchema({ content: stringSchema() }), dataSchema: ref('RecordComment') }),
    },
    '/api/v1/calendar/records/{id}/photos': {
      post: makeOperation({ operationId: 'addRecordPhoto', summary: '新增记录照片', parameters: [pathParam('id')], requestBody: ref('PhotoPayload'), dataSchema: ref('RecordPhoto') }),
    },
    '/api/v1/calendar/stats': {
      get: makeOperation({
        operationId: 'getMonthlyStats',
        summary: '获取月度统计',
        parameters: [query('table_id', uuidSchema(), true), query('year', integerSchema()), query('month', integerSchema())],
        dataSchema: ref('MonthlyStats'),
      }),
    },
    '/api/v1/wishes': {
      get: makeOperation({ operationId: 'listWishes', summary: '列出心愿', parameters: [query('table_id', uuidSchema(), true), query('completed', booleanSchema())], dataSchema: arrayOf(ref('WishItem')) }),
      post: makeOperation({ operationId: 'createWish', summary: '创建心愿', requestBody: ref('CreateWishPayload'), dataSchema: ref('WishItem') }),
    },
    '/api/v1/wishes/{id}/complete': {
      post: makeOperation({ operationId: 'completeWish', summary: '完成心愿', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/wishes/{id}': {
      delete: makeOperation({ operationId: 'deleteWish', summary: '删除心愿', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/checkin': {
      post: makeOperation({ operationId: 'checkin', summary: '签到', dataSchema: ref('CheckinResult') }),
    },
    '/api/v1/checkin/status': {
      get: makeOperation({ operationId: 'getCheckinStatus', summary: '签到状态', dataSchema: ref('CheckinStatus') }),
    },
    '/api/v1/basket': {
      get: makeOperation({ operationId: 'listBasket', summary: '列出菜篮子', parameters: [query('table_id', uuidSchema(), true)], dataSchema: arrayOf(ref('BasketItem')) }),
      post: makeOperation({ operationId: 'addToBasket', summary: '添加菜篮子项', requestBody: ref('BasketPayload'), dataSchema: ref('BasketItem') }),
    },
    '/api/v1/basket/{id}/toggle': {
      post: makeOperation({ operationId: 'toggleBasket', summary: '切换菜篮子购买状态', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/basket/{id}': {
      delete: makeOperation({ operationId: 'deleteBasket', summary: '删除菜篮子项', parameters: [pathParam('id')], dataSchema: emptySchema() }),
    },
    '/api/v1/budget': {
      get: makeOperation({ operationId: 'getBudget', summary: '获取预算', parameters: [query('table_id', uuidSchema(), true), query('month', stringSchema(), true)], dataSchema: ref('BudgetSetting') }),
      post: makeOperation({ operationId: 'setBudget', summary: '设置预算', requestBody: ref('BudgetPayload'), dataSchema: ref('BudgetSetting') }),
    },
    '/api/v1/points': {
      get: makeOperation({
        operationId: 'getPointHistory',
        summary: '积分历史',
        parameters: [query('page', integerSchema()), query('page_size', integerSchema())],
        dataSchema: paginated(ref('PointRecord')),
      }),
    },
  }).map(([route, pathItem]) => [route.replace(/^\/api\/v1/, ''), pathItem])),
}

const generatedApiSource = `// This file is generated by scripts/generate-openapi.js. Do not edit manually.

export type ApiResponse<T = unknown> = {
  code: number
  message: string
  data: T
}

export type PaginatedData<T> = {
  list: T[]
  total: number
  page: number
  page_size: number
}

export type components = {
  schemas: {
    LoginPayload: {
      code: string
      platform: 'wechat' | 'douyin'
    }
    LoginResult: {
      token: string
      uid: string
      nickname: string
      avatar: string
      is_new: boolean
      need_bind_phone: boolean
      phone: string
    }
    ProfileUpdatePayload: {
      nickname: string
      avatar: string
    }
    CoupleInfo: {
      id: string
      user1_id: string
      user2_id: string
      status: string
    }
    BuddyGroup: {
      id: string
      name: string
      owner_id: string
      max_member: number
      status: string
      created_at: string
    }
    BuddyMember: {
      id: string
      group_id: string
      user_id: string
      role: 'owner' | 'admin' | 'member'
      joined_at: string
    }
    User: {
      uid: string
      nickname: string
      avatar: string
      points: number
      has_wx: boolean
      has_dy: boolean
      phone: string
      has_phone: boolean
      couple: components['schemas']['CoupleInfo'] | null
      buddy_groups: components['schemas']['BuddyGroup'][]
      created_at: string
    }
    InviteResult: {
      code: string
      expires_at: string
    }
    BuddyGroupSummary: {
      id: string
      name: string
    }
    CreateBuddyGroupPayload: {
      name: string
    }
    JoinInvitePayload: {
      code: string
    }
    TableMember: {
      id: string
      table_id: string
      user_id: string
      role: 'owner' | 'admin' | 'member'
      status: string
      joined_at: string
    }
    Table: {
      id: string
      type: 'personal' | 'couple' | 'buddy'
      name: string
      owner_id: string
      status: string
      created_at: string
      updated_at: string
      members: components['schemas']['TableMember'][]
    }
    RenameTablePayload: {
      name: string
    }
    Ingredient: {
      name: string
      amount: string
    }
    Step: {
      order: number
      description: string
      image?: string
    }
    Dish: {
      id: string
      owner_id: string
      table_id: string
      dish_type: 'dish' | 'takeout' | 'dineout'
      name: string
      category: string
      difficulty: number | null
      duration: number
      price: number | null
      ingredients: components['schemas']['Ingredient'][] | null
      steps: components['schemas']['Step'][] | null
      photos: string[] | null
      tags: string[]
      restaurant: string
      restaurant_note: string
      source: 'manual' | 'plaza'
      is_deleted: boolean
      created_at: string
      updated_at: string
    }
    DishPayload: {
      table_id: string
      dish_type: 'dish' | 'takeout' | 'dineout'
      name: string
      category?: string
      difficulty?: number | null
      duration?: number
      price?: number | null
      ingredients?: components['schemas']['Ingredient'][]
      steps?: components['schemas']['Step'][]
      photos?: string[]
      tags?: string[]
      restaurant?: string
      restaurant_note?: string
    }
    DishUpdatePayload: Partial<Omit<components['schemas']['DishPayload'], 'table_id' | 'dish_type'>>
    ImportDishPayload: {
      plaza_id: string
      table_id: string
    }
    PlazaDish: {
      id: string
      name: string
      category: string
      difficulty: number | null
      duration: number
      ingredients: components['schemas']['Ingredient'][] | null
      steps: components['schemas']['Step'][] | null
      photos: string[] | null
      tags: string[]
      import_count: number
      created_at: string
    }
    OrderItem: {
      id: string
      order_id: string
      dish_id: string
      dish_name?: string
      quantity: number
      unit_price: number | null
    }
    OrderParticipant: {
      id: string
      order_id: string
      user_id: string
      status: 'invited' | 'accepted' | 'rejected' | 'skipped'
      created_at: string
      updated_at: string
    }
    Order: {
      id: string
      creator_id: string
      table_id: string
      dine_mode: 'together' | 'solo'
      status: 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'voted'
      total_amount: number | null
      vote_deadline?: string | null
      calendar_record_id?: string | null
      order_items: components['schemas']['OrderItem'][]
      participants?: components['schemas']['OrderParticipant'][]
      created_at: string
    }
    OrderVote: {
      id: string
      order_id: string
      user_id: string
      vote: 'approve' | 'reject' | 'skip'
      created_at: string
    }
    OrderItemPayload: {
      dish_id: string
      quantity: number
      unit_price: number | null
    }
    OrderBasketItemPayload: {
      name: string
      quantity: string
    }
    CreateOrderPayload: {
      table_id: string
      dine_mode: 'solo' | 'together'
      participant_ids?: string[]
      items: components['schemas']['OrderItemPayload'][]
      basket_items?: components['schemas']['OrderBasketItemPayload'][]
    }
    VoteOrderPayload: {
      vote: 'approve' | 'reject' | 'skip'
    }
    OrderVotes: {
      approve: number
      reject: number
      skip: number
      total: number
      votes?: components['schemas']['OrderVote'][]
    }
    RecordPhoto: {
      id: string
      record_id: string
      url: string
      type: string
      sort_order: number
    }
    RecordComment: {
      id: string
      record_id: string
      user_id: string
      content: string
      created_at: string
    }
    CalendarRecord: {
      id: string
      user_id: string
      table_id: string
      record_date: string
      meal_type: string
      meal_period: string
      dish_ids: string[]
      restaurant: string
      amount: number | null
      source: string
      status: string
      photos: components['schemas']['RecordPhoto'][]
      comments: components['schemas']['RecordComment'][]
      created_at: string
    }
    PhotoPayload: {
      url: string
      type: string
    }
    CalendarRecordPayload: {
      table_id: string
      record_date: string
      meal_type: string
      meal_period?: string
      dish_ids?: string[]
      restaurant?: string
      amount?: number | null
      photos?: components['schemas']['PhotoPayload'][]
      content?: string
    }
    CalendarRecordUpdatePayload: {
      meal_type?: string
      meal_period?: string
      restaurant?: string
      amount?: number | null
    }
    MonthlyStats: {
      total_amount: number
      meal_count: Record<string, number>
      total_records: number
      unrecorded_days: string[]
      year: number
      month: number
    }
    WishItem: {
      id: string
      user_id: string
      table_id: string
      name: string
      note: string
      dish_id: string | null
      is_completed: boolean
      created_at: string
    }
    CreateWishPayload: {
      table_id: string
      name: string
      note?: string
      dish_id?: string | null
    }
    CheckinStatus: {
      today_checked: boolean
      month_count: number
      streak: number
    }
    CheckinResult: {
      points?: number
      checkin_date?: string
      today_checked?: boolean
      month_count?: number
      streak?: number
    }
    BasketItem: {
      id: string
      user_id: string
      table_id: string
      name: string
      quantity: string
      is_purchased: boolean
      created_at: string
    }
    BasketPayload: {
      table_id: string
      name: string
      quantity?: string
    }
    BudgetSetting: {
      id: string
      user_id: string
      table_id: string
      month: string
      budget: number
      spent?: number
      created_at?: string
      updated_at?: string
    }
    BudgetPayload: {
      table_id: string
      month: string
      budget: number
    }
    PointRecord: {
      id: string
      user_id: string
      points: number
      reason: string
      created_at: string
    }
  }
}

export type operations = {
  authLogin: {
    requestBody: components['schemas']['LoginPayload']
    response: ApiResponse<components['schemas']['LoginResult']>
  }
  getProfile: {
    response: ApiResponse<components['schemas']['User']>
  }
  updateProfile: {
    requestBody: components['schemas']['ProfileUpdatePayload']
    response: ApiResponse<void>
  }
  bindPhone: {
    requestBody: { phone: string }
    response: ApiResponse<void>
  }
  createCoupleInvite: {
    response: ApiResponse<components['schemas']['InviteResult']>
  }
  joinCouple: {
    requestBody: components['schemas']['JoinInvitePayload']
    response: ApiResponse<void>
  }
  createBuddyGroup: {
    requestBody: components['schemas']['CreateBuddyGroupPayload']
    response: ApiResponse<components['schemas']['BuddyGroupSummary']>
  }
  createBuddyInvite: {
    response: ApiResponse<components['schemas']['InviteResult']>
  }
  joinBuddyGroup: {
    requestBody: components['schemas']['JoinInvitePayload']
    response: ApiResponse<void>
  }
  removeBuddyMember: {
    response: ApiResponse<void>
  }
  listTables: {
    response: ApiResponse<components['schemas']['Table'][]>
  }
  renameTable: {
    requestBody: components['schemas']['RenameTablePayload']
    response: ApiResponse<components['schemas']['Table']>
  }
  listDishes: {
    parameters: {
      query: {
        table_id: string
        dish_type?: string
        category?: string
        keyword?: string
        page?: number
        page_size?: number
      }
    }
    response: ApiResponse<PaginatedData<components['schemas']['Dish']>>
  }
  getDish: {
    response: ApiResponse<components['schemas']['Dish']>
  }
  createDish: {
    requestBody: components['schemas']['DishPayload']
    response: ApiResponse<components['schemas']['Dish']>
  }
  updateDish: {
    requestBody: components['schemas']['DishUpdatePayload']
    response: ApiResponse<void>
  }
  deleteDish: {
    response: ApiResponse<void>
  }
  importDish: {
    requestBody: components['schemas']['ImportDishPayload']
    response: ApiResponse<components['schemas']['Dish']>
  }
  searchPlaza: {
    parameters: {
      query: {
        category?: string
        keyword?: string
        page?: number
        page_size?: number
      }
    }
    response: ApiResponse<PaginatedData<components['schemas']['PlazaDish']>>
  }
  getPlazaCategories: {
    response: ApiResponse<string[]>
  }
  listOrders: {
    parameters: {
      query: {
        table_id: string
        status?: string
        page?: number
        page_size?: number
      }
    }
    response: ApiResponse<PaginatedData<components['schemas']['Order']>>
  }
  getOrder: {
    response: ApiResponse<components['schemas']['Order']>
  }
  createOrder: {
    requestBody: components['schemas']['CreateOrderPayload']
    response: ApiResponse<components['schemas']['Order']>
  }
  confirmOrder: {
    response: ApiResponse<void>
  }
  rejectOrder: {
    response: ApiResponse<void>
  }
  cancelOrder: {
    response: ApiResponse<void>
  }
  voteOrder: {
    requestBody: components['schemas']['VoteOrderPayload']
    response: ApiResponse<void>
  }
  getOrderVotes: {
    response: ApiResponse<components['schemas']['OrderVotes']>
  }
  listCalendarRecords: {
    parameters: {
      query: {
        table_id: string
        year?: number
        month?: number
      }
    }
    response: ApiResponse<components['schemas']['CalendarRecord'][]>
  }
  listCalendarRecordsByDate: {
    parameters: {
      query: {
        table_id: string
        date: string
      }
    }
    response: ApiResponse<components['schemas']['CalendarRecord'][]>
  }
  getCalendarRecord: {
    response: ApiResponse<components['schemas']['CalendarRecord']>
  }
  createCalendarRecord: {
    requestBody: components['schemas']['CalendarRecordPayload']
    response: ApiResponse<components['schemas']['CalendarRecord']>
  }
  updateCalendarRecord: {
    requestBody: components['schemas']['CalendarRecordUpdatePayload']
    response: ApiResponse<void>
  }
  deleteCalendarRecord: {
    response: ApiResponse<void>
  }
  addRecordComment: {
    requestBody: { content: string }
    response: ApiResponse<components['schemas']['RecordComment']>
  }
  addRecordPhoto: {
    requestBody: components['schemas']['PhotoPayload']
    response: ApiResponse<components['schemas']['RecordPhoto']>
  }
  getMonthlyStats: {
    parameters: {
      query: {
        table_id: string
        year?: number
        month?: number
      }
    }
    response: ApiResponse<components['schemas']['MonthlyStats']>
  }
  listWishes: {
    parameters: {
      query: {
        table_id: string
        completed?: boolean
      }
    }
    response: ApiResponse<components['schemas']['WishItem'][]>
  }
  createWish: {
    requestBody: components['schemas']['CreateWishPayload']
    response: ApiResponse<components['schemas']['WishItem']>
  }
  completeWish: {
    response: ApiResponse<void>
  }
  deleteWish: {
    response: ApiResponse<void>
  }
  checkin: {
    response: ApiResponse<components['schemas']['CheckinResult']>
  }
  getCheckinStatus: {
    response: ApiResponse<components['schemas']['CheckinStatus']>
  }
  listBasket: {
    parameters: {
      query: {
        table_id: string
      }
    }
    response: ApiResponse<components['schemas']['BasketItem'][]>
  }
  addToBasket: {
    requestBody: components['schemas']['BasketPayload']
    response: ApiResponse<components['schemas']['BasketItem']>
  }
  toggleBasket: {
    response: ApiResponse<void>
  }
  deleteBasket: {
    response: ApiResponse<void>
  }
  getBudget: {
    parameters: {
      query: {
        table_id: string
        month: string
      }
    }
    response: ApiResponse<components['schemas']['BudgetSetting']>
  }
  setBudget: {
    requestBody: components['schemas']['BudgetPayload']
    response: ApiResponse<components['schemas']['BudgetSetting']>
  }
  getPointHistory: {
    parameters: {
      query: {
        page?: number
        page_size?: number
      }
    }
    response: ApiResponse<PaginatedData<components['schemas']['PointRecord']>>
  }
}
`

fs.mkdirSync(path.dirname(openapiPath), { recursive: true })
fs.mkdirSync(path.dirname(generatedApiPath), { recursive: true })
fs.writeFileSync(openapiPath, `${JSON.stringify(spec, null, 2)}\n`)
fs.writeFileSync(generatedApiPath, generatedApiSource)
