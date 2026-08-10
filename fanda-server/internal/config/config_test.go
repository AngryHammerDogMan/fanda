package config

import (
	"testing"
)

func TestLoadRejectsUnsafeReleaseSecrets(t *testing.T) {
	t.Setenv("SERVER_MODE", "release")
	t.Setenv("JWT_SECRET", "default-secret")
	t.Setenv("ADMIN_PASSWORD", "admin123")

	_, err := Load()
	if err == nil {
		t.Fatal("期望 release 模式拒绝默认 JWT 密钥和默认后台密码")
	}
}

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
