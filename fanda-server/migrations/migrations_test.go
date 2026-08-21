package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 测试意图：静态检查 005 迁移会补齐 couple_members，并在建唯一约束前处理历史冲突。
func TestCoupleMembersMigrationNormalizesActiveUserUniqueness(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("005_couple_members.sql"))
	if err != nil {
		t.Fatalf("005 迁移必须存在: %v", err)
	}
	sql := strings.ToLower(string(content))
	// fragment 是迁移 SQL 必须包含的关键片段，覆盖建表、回填 active 数据和唯一约束。
	for _, fragment := range []string{
		"create table couple_members",
		"insert into couple_members",
		"where status = 'active'",
		"unique",
		"user_id",
	} {
		if !strings.Contains(sql, fragment) {
			t.Fatalf("005 迁移缺少 %q", fragment)
		}
	}
	if !strings.Contains(sql, "having count(*) > 1") {
		t.Fatal("005 迁移必须在建立唯一索引前检查历史 active 用户冲突")
	}
}

// 测试意图：006 迁移新增订单项确认金额，并回填订单及关联日历的汇总金额。
func TestConfirmedAmountMigration(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("006_order_item_confirmed_amount.sql"))
	if err != nil {
		t.Fatalf("006 迁移必须存在: %v", err)
	}
	sql := string(content)
	for _, fragment := range []string{
		"ADD COLUMN confirmed_amount DECIMAL(10,2)",
		"ROUND(unit_price * quantity, 2)",
		"SUM(confirmed_amount)",
		"orders.calendar_record_id = calendar_records.id",
	} {
		if !strings.Contains(sql, fragment) {
			t.Fatalf("006 迁移缺少 %q", fragment)
		}
	}
}
