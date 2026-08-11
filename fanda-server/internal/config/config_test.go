package config

import (
	"testing"
)

// TestLoadRejectsUnsafeReleaseSecrets 覆盖生产模式安全兜底：默认 JWT/后台密码必须被拒绝。
func TestLoadRejectsUnsafeReleaseSecrets(t *testing.T) {
	t.Setenv("SERVER_MODE", "release")
	t.Setenv("JWT_SECRET", "default-secret")
	t.Setenv("ADMIN_PASSWORD", "admin123")

	_, err := Load()
	if err == nil {
		t.Fatal("期望 release 模式拒绝默认 JWT 密钥和默认后台密码")
	}
}

// TestLoadAcceptsDevelopmentDefaults 覆盖本地开发模式：允许默认配置，降低本地启动成本。
func TestLoadAcceptsDevelopmentDefaults(t *testing.T) {
	t.Setenv("SERVER_MODE", "debug")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("debug 模式不应拒绝本地默认配置: %v", err)
	}
	if cfg.JWTSecret == "" {
		t.Fatal("JWTSecret 不应为空")
	}
}
