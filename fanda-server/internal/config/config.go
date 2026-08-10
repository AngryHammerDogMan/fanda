package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

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
	if len(problems) > 0 {
		return errors.New("生产配置不安全: " + strings.Join(problems, "; "))
	}
	return nil
}

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

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if val := os.Getenv(key); val != "" {
		if n, err := strconv.Atoi(val); err == nil {
			return n
		}
	}
	return fallback
}
