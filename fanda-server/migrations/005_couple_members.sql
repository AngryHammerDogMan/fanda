-- 005: 规范化情侣成员，跨 user1_id/user2_id 保证每个用户至多属于一段 active 关系。
-- 文件职责：把 couples 的两列成员关系展开为 couple_members 行式关系，便于唯一约束。

DO $$
BEGIN
    -- 核心逻辑：迁移前先阻断已存在的多段 active 情侣关系，避免唯一索引创建失败后半迁移。
    IF EXISTS (
        SELECT user_id
        FROM (
            SELECT user1_id AS user_id FROM couples WHERE status = 'active'
            UNION ALL
            SELECT user2_id AS user_id FROM couples WHERE status = 'active'
        ) active_members
        GROUP BY user_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION '存在用户属于多段 active 情侣关系，无法迁移 couple_members';
    END IF;
END $$;

CREATE TABLE couple_members (
    -- couple_id + user_id 唯一保证同一关系不重复；active user 唯一保证用户不同时处于多段情侣关系。
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id   UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(uid),
    status      VARCHAR(15) NOT NULL DEFAULT 'active'
);

INSERT INTO couple_members (couple_id, user_id, status)
SELECT id, user1_id, status FROM couples
UNION ALL
SELECT id, user2_id, status FROM couples;

CREATE UNIQUE INDEX idx_couple_members_couple_user
    ON couple_members(couple_id, user_id);
CREATE UNIQUE INDEX idx_couple_members_active_user
    ON couple_members(user_id) WHERE status = 'active';
CREATE INDEX idx_couple_members_couple
    ON couple_members(couple_id);
