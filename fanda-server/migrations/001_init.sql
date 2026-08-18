-- 饭搭小程序 - 数据库初始化脚本
-- PostgreSQL 16
-- 文件职责：创建首版业务全量表结构、索引、触发器和表级注释。

-- 启用 uuid 扩展；pg_trgm 用于菜名模糊搜索的 GIN trigram 索引。
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================
-- 1. 用户表
-- ============================================================
CREATE TABLE users (
    -- uid 是业务用户主键；openid/phone 分别承载平台账号和跨平台合并标识。
    uid         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wx_openid   VARCHAR(64) UNIQUE,
    dy_openid   VARCHAR(64) UNIQUE,
    phone       VARCHAR(20) UNIQUE,
    nickname    VARCHAR(50) NOT NULL,
    avatar      VARCHAR(500) DEFAULT '',
    points      INT DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_wx_openid ON users(wx_openid) WHERE wx_openid IS NOT NULL;
CREATE INDEX idx_users_dy_openid ON users(dy_openid) WHERE dy_openid IS NOT NULL;
CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;

-- ============================================================
-- 2. 情侣关系表
-- ============================================================
CREATE TABLE couples (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id    UUID NOT NULL REFERENCES users(uid),
    user2_id    UUID NOT NULL REFERENCES users(uid),
    status      VARCHAR(15) NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_couple_user1 ON couples(user1_id) WHERE status = 'active';
CREATE UNIQUE INDEX idx_couple_user2 ON couples(user2_id) WHERE status = 'active';

-- ============================================================
-- 3. 情侣邀请码表
-- ============================================================
CREATE TABLE couple_invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_id  UUID NOT NULL REFERENCES users(uid),
    code        VARCHAR(10) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    is_used     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_couple_invites_code ON couple_invites(code);

-- ============================================================
-- 4. 饭搭子组合表
-- ============================================================
CREATE TABLE buddy_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50) NOT NULL,
    owner_id    UUID NOT NULL REFERENCES users(uid),
    max_member  INT DEFAULT 10,
    status      VARCHAR(15) NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buddy_groups_owner ON buddy_groups(owner_id);

-- ============================================================
-- 5. 饭搭子成员表
-- ============================================================
CREATE TABLE buddy_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES buddy_groups(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    role        VARCHAR(10) NOT NULL DEFAULT 'member',
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_buddy_group_user ON buddy_members(group_id, user_id);
CREATE INDEX idx_buddy_members_user ON buddy_members(user_id);

-- ============================================================
-- 6. 饭搭子邀请码表
-- ============================================================
CREATE TABLE buddy_invites (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES buddy_groups(id) ON DELETE CASCADE,
    inviter_id  UUID NOT NULL REFERENCES users(uid),
    code        VARCHAR(10) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    is_used     BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buddy_invites_code ON buddy_invites(code);

-- ============================================================
-- 8. 菜品表
-- ============================================================
CREATE TABLE dishes (
    -- group_type/group_id 是早期归属模型，003 起逐步迁移到统一 table_id。
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(uid),
    group_type      VARCHAR(10) NOT NULL CHECK (group_type IN ('couple', 'buddy')),
    group_id        UUID NOT NULL,
    dish_type       VARCHAR(10) NOT NULL CHECK (dish_type IN ('dish', 'takeout', 'dineout')),
    name            VARCHAR(100) NOT NULL,
    category        VARCHAR(30),
    difficulty      SMALLINT CHECK (difficulty BETWEEN 1 AND 4),
    duration        INT,
    price           DECIMAL(10,2),
    ingredients     JSONB,
    steps           JSONB,
    photos          JSONB,
    tags            TEXT[],
    restaurant      VARCHAR(100),
    restaurant_note TEXT,
    source          VARCHAR(10) DEFAULT 'manual',
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dishes_owner ON dishes(owner_id);
CREATE INDEX idx_dishes_group ON dishes(group_type, group_id);
CREATE INDEX idx_dishes_type ON dishes(dish_type);
CREATE INDEX idx_dishes_tags ON dishes USING GIN(tags);
CREATE INDEX idx_dishes_name_trgm ON dishes USING GIN(name gin_trgm_ops);

-- ============================================================
-- 9. 订单表
-- ============================================================
CREATE TABLE orders (
    -- status 驱动一起吃确认/拒绝/取消/投票流程，calendar_record_id 关联日历记录。
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id          UUID NOT NULL REFERENCES users(uid),
    group_type          VARCHAR(10) NOT NULL CHECK (group_type IN ('couple', 'buddy')),
    group_id            UUID NOT NULL,
    dine_mode           VARCHAR(10) NOT NULL CHECK (dine_mode IN ('together', 'solo')),
    status              VARCHAR(15) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'voted')),
    total_amount        DECIMAL(10,2),
    vote_deadline       TIMESTAMPTZ,
    calendar_record_id  UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_creator ON orders(creator_id);
CREATE INDEX idx_orders_group ON orders(group_type, group_id);
CREATE INDEX idx_orders_status ON orders(status);

-- ============================================================
-- 10. 订单菜品关联表
-- ============================================================
CREATE TABLE order_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    dish_id     UUID NOT NULL REFERENCES dishes(id),
    quantity    INT DEFAULT 1,
    unit_price  DECIMAL(10,2)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- 11. 订单投票表（饭搭子）
-- ============================================================
CREATE TABLE order_votes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    vote        VARCHAR(10) NOT NULL CHECK (vote IN ('approve', 'reject', 'skip')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_order_vote_unique ON order_votes(order_id, user_id);

-- ============================================================
-- 12. 日历记录表
-- ============================================================
CREATE TABLE calendar_records (
    -- record_date + meal_type 记录每日每餐；amount 为空时会被月度统计标记为待补录。
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(uid),
    group_type      VARCHAR(10) NOT NULL CHECK (group_type IN ('couple', 'buddy')),
    group_id        UUID NOT NULL,
    record_date     DATE NOT NULL,
    meal_type       VARCHAR(10) NOT NULL CHECK (meal_type IN ('cook', 'takeout', 'dineout')),
    meal_period     VARCHAR(10),
    dish_ids        UUID[],
    restaurant      VARCHAR(100),
    amount          DECIMAL(10,2),
    source          VARCHAR(10) DEFAULT 'manual',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_user_date ON calendar_records(user_id, record_date);
CREATE INDEX idx_calendar_group ON calendar_records(group_type, group_id, record_date);

-- ============================================================
-- 13. 记录照片表
-- ============================================================
CREATE TABLE record_photos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id   UUID NOT NULL REFERENCES calendar_records(id) ON DELETE CASCADE,
    url         VARCHAR(500) NOT NULL,
    type        VARCHAR(10) DEFAULT 'image' CHECK (type IN ('image', 'video')),
    sort_order  INT DEFAULT 0
);

CREATE INDEX idx_record_photos ON record_photos(record_id);

-- ============================================================
-- 14. 记录留言表
-- ============================================================
CREATE TABLE record_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id   UUID NOT NULL REFERENCES calendar_records(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    content     TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_record_comments ON record_comments(record_id);

-- ============================================================
-- 15. 学菜广场菜品表
-- ============================================================
CREATE TABLE plaza_dishes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(30),
    difficulty  SMALLINT CHECK (difficulty BETWEEN 1 AND 4),
    duration    INT,
    ingredients JSONB,
    steps       JSONB,
    photos      JSONB,
    tags        TEXT[],
    import_count INT DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_plaza_tags ON plaza_dishes USING GIN(tags);
CREATE INDEX idx_plaza_category ON plaza_dishes(category);

-- ============================================================
-- 16. 心愿清单表
-- ============================================================
CREATE TABLE wish_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(uid),
    group_type  VARCHAR(10) NOT NULL CHECK (group_type IN ('couple', 'buddy')),
    group_id    UUID NOT NULL,
    name        VARCHAR(100) NOT NULL,
    note        TEXT,
    dish_id     UUID REFERENCES dishes(id),
    is_completed BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wish_user ON wish_items(user_id, group_type, group_id);

-- ============================================================
-- 17. 签到记录表
-- ============================================================
CREATE TABLE checkins (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(uid),
    checkin_date DATE NOT NULL,
    points      INT DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_checkin_user_date ON checkins(user_id, checkin_date);

-- ============================================================
-- 18. 积分历史表
-- ============================================================
CREATE TABLE point_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(uid),
    points      INT NOT NULL,
    reason      VARCHAR(50) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_point_records_user ON point_records(user_id);

-- ============================================================
-- 19. 预算设置表
-- ============================================================
CREATE TABLE budget_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(uid),
    group_type  VARCHAR(10) NOT NULL CHECK (group_type IN ('couple', 'buddy')),
    group_id    UUID NOT NULL,
    month       VARCHAR(7) NOT NULL,  -- 格式: 2026-08
    budget      DECIMAL(10,2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_budget_unique ON budget_settings(user_id, group_type, group_id, month);

-- ============================================================
-- 20. 菜篮子表
-- ============================================================
CREATE TABLE shopping_baskets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(uid),
    group_type  VARCHAR(10) NOT NULL CHECK (group_type IN ('couple', 'buddy')),
    group_id    UUID NOT NULL,
    name        VARCHAR(100) NOT NULL,
    quantity    VARCHAR(30) DEFAULT '1',
    is_purchased BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_basket_group ON shopping_baskets(user_id, group_type, group_id);

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- 核心逻辑：任何 UPDATE 自动刷新 updated_at，避免业务层遗漏更新时间维护。
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_dishes_updated_at BEFORE UPDATE ON dishes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_budget_updated_at BEFORE UPDATE ON budget_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE users IS '用户表';
COMMENT ON TABLE couples IS '情侣关系表';
COMMENT ON TABLE couple_invites IS '情侣邀请码表';
COMMENT ON TABLE buddy_groups IS '饭搭子组合表';
COMMENT ON TABLE buddy_members IS '饭搭子成员表';
COMMENT ON TABLE buddy_invites IS '饭搭子邀请码表';
COMMENT ON TABLE dishes IS '菜品表';
COMMENT ON TABLE orders IS '订单表';
COMMENT ON TABLE order_items IS '订单菜品关联表';
COMMENT ON TABLE order_votes IS '订单投票表';
COMMENT ON TABLE calendar_records IS '日历记录表';
COMMENT ON TABLE record_photos IS '记录照片表';
COMMENT ON TABLE record_comments IS '记录留言表';
COMMENT ON TABLE plaza_dishes IS '学菜广场菜品表';
COMMENT ON TABLE wish_items IS '心愿清单表';
COMMENT ON TABLE checkins IS '签到记录表';
COMMENT ON TABLE point_records IS '积分历史表';
COMMENT ON TABLE budget_settings IS '预算设置表';
COMMENT ON TABLE shopping_baskets IS '菜篮子表';
