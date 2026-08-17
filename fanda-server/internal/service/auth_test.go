package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"fanda-server/internal/config"
)

func TestExchangeOpenIDRejectsMockInRelease(t *testing.T) {
	svc := NewAuthService(&config.Config{ServerMode: "release"})

	openID, err := svc.exchangeOpenID("wechat", "mock-code")
	if err == nil {
		t.Fatal("release 模式应拒绝使用 mock openid")
	}
	if openID != "" {
		t.Fatalf("release 模式拒绝 mock openid 时不应返回 openid，实际为 %q", openID)
	}
	if !strings.Contains(err.Error(), "release") {
		t.Fatalf("错误信息应说明 release 模式禁止 mock openid，实际为 %q", err.Error())
	}
}

func TestExchangeOpenIDCallsWechatJscode2SessionInRelease(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/sns/jscode2session" {
			t.Fatalf("微信 code2session 路径错误: %s", r.URL.Path)
		}
		q := r.URL.Query()
		if q.Get("appid") != "wx-app" || q.Get("secret") != "wx-secret" || q.Get("js_code") != "wx-code" || q.Get("grant_type") != "authorization_code" {
			t.Fatalf("微信 code2session query 错误: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"openid":"wx-openid","session_key":"session-key"}`))
	}))
	defer server.Close()

	svc := NewAuthService(&config.Config{
		ServerMode: "release",
		WxAppID:    "wx-app",
		WxSecret:   "wx-secret",
	})
	svc.httpClient = server.Client()
	svc.wxCode2SessionURL = server.URL + "/sns/jscode2session"

	openID, err := svc.exchangeOpenID("wechat", "wx-code")
	if err != nil {
		t.Fatalf("微信 release code2session 不应失败: %v", err)
	}
	if openID != "wx-openid" {
		t.Fatalf("微信 openid 解析错误，got %q", openID)
	}
}

func TestExchangeOpenIDCallsDouyinCode2SessionInRelease(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/apps/v2/jscode2session" {
			t.Fatalf("抖音 code2session 路径错误: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("抖音 code2session 应使用 POST，got %s", r.Method)
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("抖音 code2session body 不是 JSON: %v", err)
		}
		if body["appid"] != "dy-app" || body["secret"] != "dy-secret" || body["code"] != "dy-code" {
			t.Fatalf("抖音 code2session body 错误: %#v", body)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"err_no":0,"err_tips":"success","data":{"openid":"dy-openid","session_key":"session-key"}}`))
	}))
	defer server.Close()

	svc := NewAuthService(&config.Config{
		ServerMode: "release",
		DyAppID:    "dy-app",
		DySecret:   "dy-secret",
	})
	svc.httpClient = server.Client()
	svc.dyCode2SessionURL = server.URL + "/api/apps/v2/jscode2session"

	openID, err := svc.exchangeOpenID("douyin", "dy-code")
	if err != nil {
		t.Fatalf("抖音 release code2session 不应失败: %v", err)
	}
	if openID != "dy-openid" {
		t.Fatalf("抖音 openid 解析错误，got %q", openID)
	}
}

func TestExchangeOpenIDRejectsUnsupportedPlatform(t *testing.T) {
	svc := NewAuthService(&config.Config{
		ServerMode: "release",
		WxAppID:    "wx-app",
		WxSecret:   "wx-secret",
		DyAppID:    "dy-app",
		DySecret:   "dy-secret",
	})

	openID, err := svc.exchangeOpenID("alipay", "code")
	if err == nil {
		t.Fatal("未知平台应返回错误")
	}
	if openID != "" {
		t.Fatalf("未知平台不应返回 openid，got %q", openID)
	}
	if !strings.Contains(err.Error(), "不支持的平台") {
		t.Fatalf("错误信息应说明平台不支持，got %q", err.Error())
	}
}
