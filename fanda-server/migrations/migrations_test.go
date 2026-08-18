package migrations_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCoupleMembersMigrationNormalizesActiveUserUniqueness(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("005_couple_members.sql"))
	if err != nil {
		t.Fatalf("005 迁移必须存在: %v", err)
	}
	sql := strings.ToLower(string(content))
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
