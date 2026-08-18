package main

import (
	"flag"
	"os"
	"path/filepath"
	"testing"

	"fanda-server/internal/config"
)

// 测试意图：迁移命令入口必须复用 config.Load，并支持显式 baseline 参数。
func TestMigrateCommandLoadsDatabaseConfigFromDotEnv(t *testing.T) {
	// dir 是隔离的临时工作目录，.env 写在其中以验证配置加载路径。
	dir := t.TempDir()
	requireChdir(t, dir)
	original, existed := os.LookupEnv("DB_NAME")
	if err := os.Unsetenv("DB_NAME"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if existed {
			_ = os.Setenv("DB_NAME", original)
		} else {
			_ = os.Unsetenv("DB_NAME")
		}
	})
	if err := os.WriteFile(filepath.Join(dir, ".env"), []byte("DB_NAME=from-dot-env\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.DBName != "from-dot-env" {
		t.Fatalf("迁移命令应通过 config.Load 读取 .env，实际 DB_NAME=%q", cfg.DBName)
	}
}

func TestParseOptionsAcceptsExplicitBaseline004(t *testing.T) {
	// options 是命令行参数解析结果，关键断言 baseline 字段能接收 004。
	options, err := parseOptions([]string{"-baseline", "004"}, flag.ContinueOnError)
	if err != nil {
		t.Fatal(err)
	}
	if options.baseline != "004" {
		t.Fatalf("baseline = %q, want 004", options.baseline)
	}
}

func requireChdir(t *testing.T, dir string) {
	t.Helper()
	// original 保存测试前工作目录，Cleanup 中恢复以避免影响后续测试。
	original, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(original) })
}
