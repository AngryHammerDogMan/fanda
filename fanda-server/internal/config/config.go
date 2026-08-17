// Package config 负责从环境变量和 .env 文件加载运行配置，并在生产模式下
// 拦截明显不安全的默认密钥，避免服务以本地开发配置上线。
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

// Config 汇总服务启动所需的外部依赖、鉴权和跨域配置。
type Config struct {
	ServerPort string
	ServerMode string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	RedisHost     string
	RedisPort     string
	RedisPassword string
	RedisDB       int

	JWTSecret      string
	JWTExpireHours int

	AdminPassword string

	WxAppID  string
	WxSecret string
	DyAppID  string
	DySecret string

	UploadDir     string
	MaxUploadSize int64

	CORSAllowOrigins string
}

// Load 优先读取 .env，再用环境变量覆盖默认值；最后统一执行安全校验。
func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		ServerPort: getEnv("SERVER_PORT", "8080"),
		ServerMode: getEnv("SERVER_MODE", "debug"),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "postgres"),
		DBPassword: getEnv("DB_PASSWORD", ""),
		DBName:     getEnv("DB_NAME", "fanda"),
		DBSSLMode:  getEnv("DB_SSLMODE", "disable"),

		RedisHost:     getEnv("REDIS_HOST", "localhost"),
		RedisPort:     getEnv("REDIS_PORT", "6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvInt("REDIS_DB", 0),

		JWTSecret:      getEnv("JWT_SECRET", "default-secret"),
		JWTExpireHours: getEnvInt("JWT_EXPIRE_HOURS", 168),

		AdminPassword: getEnv("ADMIN_PASSWORD", "admin123"),

		WxAppID:  getEnv("WX_APPID", ""),
		WxSecret: getEnv("WX_SECRET", ""),
		DyAppID:  getEnv("DY_APPID", ""),
		DySecret: getEnv("DY_SECRET", ""),

		UploadDir:        getEnv("UPLOAD_DIR", "./uploads"),
		MaxUploadSize:    int64(getEnvInt("MAX_UPLOAD_SIZE", 10485760)),
		CORSAllowOrigins: getEnv("CORS_ALLOW_ORIGINS", "*"),
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// Validate 只在 release 模式启用强校验，debug 模式保留开箱即用的本地默认值。
func (c *Config) Validate() error {
	if c.ServerMode != "release" {
		return nil
	}

	var problems []string
	if c.JWTSecret == "" || c.JWTSecret == "default-secret" || len(c.JWTSecret) < 32 {
		problems = append(problems, "JWT_SECRET 必须设置为至少 32 位的非默认密钥")
	}
	if c.AdminPassword == "" || c.AdminPassword == "admin123" || len(c.AdminPassword) < 12 {
		problems = append(problems, "ADMIN_PASSWORD 必须设置为至少 12 位的非默认密码")
	}
	if isMissingPlatformCredential(c.WxAppID, "your_wx_appid") {
		problems = append(problems, "WX_APPID 必须设置为真实微信小程序 appid")
	}
	if isMissingPlatformCredential(c.WxSecret, "your_wx_secret") {
		problems = append(problems, "WX_SECRET 必须设置为真实微信小程序 secret")
	}
	if isMissingPlatformCredential(c.DyAppID, "your_dy_appid") {
		problems = append(problems, "DY_APPID 必须设置为真实抖音小程序 appid")
	}
	if isMissingPlatformCredential(c.DySecret, "your_dy_secret") {
		problems = append(problems, "DY_SECRET 必须设置为真实抖音小程序 secret")
	}
	if len(problems) > 0 {
		return errors.New("生产配置不安全: " + strings.Join(problems, "; "))
	}
	return nil
}

// AllowsOrigin 判断请求 Origin 是否在 CORS_ALLOW_ORIGINS 白名单中。
func (c *Config) AllowsOrigin(origin string) bool {
	if c.CORSAllowOrigins == "*" {
		return true
	}
	for _, item := range strings.Split(c.CORSAllowOrigins, ",") {
		if strings.TrimSpace(item) == origin {
			return true
		}
	}
	return false
}

func (c *Config) String() string {
	return fmt.Sprintf("port=%s mode=%s db=%s:%s/%s", c.ServerPort, c.ServerMode, c.DBHost, c.DBPort, c.DBName)
}

// getEnv 返回非空环境变量，否则回退到调用方提供的默认值。
func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

// getEnvInt 解析整数环境变量；非法值不报错，沿用默认配置保证服务可启动。
func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	}
	return fallback
}

func isMissingPlatformCredential(value, placeholder string) bool {
	trimmed := strings.TrimSpace(value)
	return trimmed == "" || trimmed == placeholder
}
