package main

import (
	"flag"
	"os"
	"path/filepath"
	"testing"

	"fanda-server/internal/config"
)

func TestMigrateCommandLoadsDatabaseConfigFromDotEnv(t *testing.T) {
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
	original, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Chdir(original) })
}
