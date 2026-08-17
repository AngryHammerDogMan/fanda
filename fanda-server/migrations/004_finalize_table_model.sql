-- 004: 收口统一餐桌模型
-- 将已能匹配 tables 的历史 group_id 回填到 table_id，并在核心业务表上
-- 强制新餐桌模型的非空约束；旧 group_type/group_id 字段保留但不再强制写入。

UPDATE dishes
SET table_id = group_id
WHERE table_id IS NULL
  AND group_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = dishes.group_id);

UPDATE orders
SET table_id = group_id
WHERE table_id IS NULL
  AND group_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = orders.group_id);

UPDATE calendar_records
SET table_id = group_id
WHERE table_id IS NULL
  AND group_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM tables t WHERE t.id = calendar_records.group_id);

ALTER TABLE dishes ALTER COLUMN table_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN table_id SET NOT NULL;
ALTER TABLE calendar_records ALTER COLUMN table_id SET NOT NULL;

ALTER TABLE dishes ALTER COLUMN group_type DROP NOT NULL;
ALTER TABLE dishes ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN group_type DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE calendar_records ALTER COLUMN group_type DROP NOT NULL;
ALTER TABLE calendar_records ALTER COLUMN group_id DROP NOT NULL;
