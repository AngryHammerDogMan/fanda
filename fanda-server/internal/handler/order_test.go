package handler

import (
	"os"
	"strings"
	"testing"
)

func TestCreateOrderMapsRequestErrorsToBadRequest(t *testing.T) {
	content, err := os.ReadFile("order.go")
	if err != nil {
		t.Fatalf("读取订单 handler 失败: %v", err)
	}
	source := string(content)
	if !strings.Contains(source, "service.IsOrderRequestError(err)") {
		t.Fatal("创建订单必须识别请求业务错误")
	}
	if !strings.Contains(source, "c.JSON(http.StatusBadRequest") {
		t.Fatal("创建订单请求业务错误必须返回 400")
	}
}
