-- 002: 添加手机号字段，支持手机号注册和跨平台账号互通
-- 手机号作为账号 ID，微信和抖音的双平台数据通过手机号打通

-- 添加 phone 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- 手机号唯一索引（允许 NULL，因为初期可能未绑定）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;