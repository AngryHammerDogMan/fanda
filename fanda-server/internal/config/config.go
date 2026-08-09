package config

import (
	"os"
	"strconv"

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
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
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

		UploadDir:     getEnv("UPLOAD_DIR", "./uploads"),
		MaxUploadSize: int64(getEnvInt("MAX_UPLOAD_SIZE", 10485760)),
	}
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