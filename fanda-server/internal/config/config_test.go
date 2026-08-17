package config

import (
	"strings"
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

// TestLoadRejectsReleaseWithoutPlatformSecrets 覆盖生产模式必须配置真实平台密钥，避免退回 mock 登录。
func TestLoadRejectsReleaseWithoutPlatformSecrets(t *testing.T) {
	t.Setenv("SERVER_MODE", "release")
	t.Setenv("JWT_SECRET", "release-jwt-secret-with-at-least-32-chars")
	t.Setenv("ADMIN_PASSWORD", "release-admin-password")
	t.Setenv("WX_APPID", "")
	t.Setenv("WX_SECRET", "")
	t.Setenv("DY_APPID", "")
	t.Setenv("DY_SECRET", "")

	_, err := Load()
	if err == nil {
		t.Fatal("release 模式缺少微信/抖音平台密钥时应失败")
	}
	if !strings.Contains(err.Error(), "WX_APPID") || !strings.Contains(err.Error(), "WX_SECRET") ||
		!strings.Contains(err.Error(), "DY_APPID") || !strings.Contains(err.Error(), "DY_SECRET") {
		t.Fatalf("错误信息应指出缺失的平台配置，got %q", err.Error())
	}
}
