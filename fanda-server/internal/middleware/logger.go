// Package middleware 中的日志与 CORS 处理在路由入口统一安装。
package middleware

import (
	"fanda-server/internal/config"
	"log"
	"time"

	"github.com/gin-gonic/gin"
)

// Logger 记录每个请求的状态码、方法、路径和耗时，用于本地排查接口错误。
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		c.Next()

		latency := time.Since(start)
		status := c.Writer.Status()
		method := c.Request.Method

		log.Printf("[%d] %s %s | %v", status, method, path, latency)
	}
}

// CORS 根据配置动态回写允许的 Origin，并提前结束浏览器预检请求。
func CORS(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && cfg.AllowsOrigin(origin) {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
		} else if cfg.CORSAllowOrigins == "*" {
			c.Header("Access-Control-Allow-Origin", "*")
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
