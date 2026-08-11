-- 003: 餐桌模型与点单流程重构
-- 引入统一 tables / table_members 权限边界，并为既有业务表补充 table_id。

CREATE TABLE IF NOT EXISTS tables (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type        VARCHAR(10) NOT NULL CHECK (type IN ('personal', 'couple', 'buddy')),
    name        VARCHAR(50) NOT NULL,
    owner_id    UUID NOT NULL REFERENCES users(uid),
    status      VARCHAR(15) NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tables_owner ON tables(owner_id);
CREATE INDEX IF NOT EXISTS idx_tables_type ON tables(type);

CREATE TABLE IF NOT EXISTS table_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id    UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    role        VARCHAR(10) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    status      VARCHAR(15) NOT NULL DEFAULT 'active',
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_table_member_unique ON table_members(table_id, user_id);
CREATE INDEX IF NOT EXISTS idx_table_members_user ON table_members(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_owned_personal_table_per_user
ON tables(owner_id)
WHERE type = 'personal' AND status = 'active';

-- PostgreSQL 的部分索引条件不能引用另一张表，因此“每个用户只能加入一个情侣餐桌”
-- 由 TableService 在创建或绑定情侣餐桌时通过事务校验 table_members 实现。

ALTER TABLE dishes ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE calendar_records ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE calendar_records ADD COLUMN IF NOT EXISTS status VARCHAR(15) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending', 'confirmed', 'cancelled'));
ALTER TABLE wish_items ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE shopping_baskets ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);
ALTER TABLE budget_settings ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES tables(id);

CREATE TABLE IF NOT EXISTS order_participants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    status      VARCHAR(15) NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited', 'accepted', 'rejected', 'skipped')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_participant_unique ON order_participants(order_id, user_id);
CREATE INDEX IF NOT EXISTS idx_order_participants_user ON order_participants(user_id);

-- 为每个用户创建个人餐桌。若已有 active 个人餐桌，则不重复创建。
INSERT INTO tables (id, type, name, owner_id, status, created_at, updated_at)
SELECT gen_random_uuid(), 'personal', '我的餐桌', users.uid, 'active', NOW(), NOW()
FROM users
WHERE NOT EXISTS (
    SELECT 1
    FROM tables t
    WHERE t.owner_id = users.uid
      AND t.type = 'personal'
      AND t.status = 'active'
);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT t.id, t.owner_id, 'owner', 'active', NOW()
FROM tables t
WHERE t.type = 'personal'
  AND t.status = 'active'
  AND NOT EXISTS (
      SELECT 1
      FROM table_members tm
      WHERE tm.table_id = t.id
        AND tm.user_id = t.owner_id
  );

-- 将情侣关系映射为情侣餐桌，沿用 couples.id 以便 group_id 可直接迁移为 table_id。
INSERT INTO tables (id, type, name, owner_id, status, created_at, updated_at)
SELECT c.id, 'couple', '情侣餐桌', c.user1_id, c.status, c.created_at, NOW()
FROM couples c
WHERE NOT EXISTS (
    SELECT 1 FROM tables t WHERE t.id = c.id
);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT c.id, c.user1_id, 'owner', c.status, c.created_at
FROM couples c
WHERE NOT EXISTS (
    SELECT 1
    FROM table_members tm
    WHERE tm.table_id = c.id
      AND tm.user_id = c.user1_id
);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT c.id, c.user2_id, 'member', c.status, c.created_at
FROM couples c
WHERE NOT EXISTS (
    SELECT 1
    FROM table_members tm
    WHERE tm.table_id = c.id
      AND tm.user_id = c.user2_id
);

-- 将饭搭子组合映射为饭搭餐桌，沿用 buddy_groups.id 以便 group_id 可直接迁移为 table_id。
INSERT INTO tables (id, type, name, owner_id, status, created_at, updated_at)
SELECT bg.id, 'buddy', bg.name, bg.owner_id, bg.status, bg.created_at, bg.updated_at
FROM buddy_groups bg
WHERE NOT EXISTS (
    SELECT 1 FROM tables t WHERE t.id = bg.id
);

INSERT INTO table_members (table_id, user_id, role, status, joined_at)
SELECT bm.group_id, bm.user_id, bm.role, 'active', bm.joined_at
FROM buddy_members bm
WHERE EXISTS (
    SELECT 1 FROM tables t WHERE t.id = bm.group_id
)
  AND NOT EXISTS (
      SELECT 1
      FROM table_members tm
      WHERE tm.table_id = bm.group_id
        AND tm.user_id = bm.user_id
);

UPDATE dishes
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = dishes.group_id);

UPDATE orders
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = orders.group_id);

UPDATE calendar_records
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = calendar_records.group_id);

UPDATE wish_items
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = wish_items.group_id);

UPDATE shopping_baskets
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = shopping_baskets.group_id);

UPDATE budget_settings
SET table_id = group_id
WHERE table_id IS NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = budget_settings.group_id);

CREATE INDEX IF NOT EXISTS idx_dishes_table ON dishes(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_calendar_table ON calendar_records(table_id, record_date);
CREATE INDEX IF NOT EXISTS idx_wish_table ON wish_items(table_id);
CREATE INDEX IF NOT EXISTS idx_basket_table ON shopping_baskets(table_id);
CREATE INDEX IF NOT EXISTS idx_budget_table ON budget_settings(table_id);
