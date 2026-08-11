// Package middleware 提供跨请求的通用处理，包括 JWT 鉴权、管理员鉴权和 CORS。
package middleware

import (
	"net/http"
	"strings"

	"fanda-server/internal/config"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Claims 是用户端 JWT 的最小载荷；uid 会在通过校验后注入 Gin Context。
type Claims struct {
	UID      string `json:"uid"`
	Platform string `json:"platform"`
	jwt.RegisteredClaims
}

// AuthMiddleware 校验 Authorization: Bearer <token>，失败时直接返回 401 并中止请求。
func AuthMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 鉴权错误按缺失、格式错误、签名/过期、uid 非法分层返回，便于前端区分登录态问题。
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "缺少认证令牌"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "认证格式错误"})
			c.Abort()
			return
		}

		tokenStr := parts[1]
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "令牌无效或已过期"})
			c.Abort()
			return
		}

		uid, err := uuid.Parse(claims.UID)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "令牌中的用户ID无效"})
			c.Abort()
			return
		}

		// uid/platform 是后续 handler 和 service 做用户归属、群组授权的上下文来源。
		c.Set("uid", uid)
		c.Set("platform", claims.Platform)
		c.Next()
	}
}

// OptionalAuth 可选的认证中间件：有 token 则解析，没有也放行。
func OptionalAuth(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.Next()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.Next()
			return
		}

		tokenStr := parts[1]
		claims := &Claims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})

		if err == nil && token.Valid {
			if uid, err := uuid.Parse(claims.UID); err == nil {
				c.Set("uid", uid)
				c.Set("platform", claims.Platform)
			}
		}
		c.Next()
	}
}

// AdminMiddleware 管理员认证中间件，只接受 role=admin 的 JWT。
func AdminMiddleware(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "缺少认证令牌"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "认证格式错误"})
			c.Abort()
			return
		}

		tokenStr := parts[1]
		claims := jwt.MapClaims{}

		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"code": 401, "message": "令牌无效或已过期"})
			c.Abort()
			return
		}

		// 管理端不依赖用户 uid，而是通过 role claim 与普通用户令牌隔离权限。
		role, ok := claims["role"].(string)
		if !ok || role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"code": 403, "message": "无管理员权限"})
			c.Abort()
			return
		}

		c.Next()
	}
}
