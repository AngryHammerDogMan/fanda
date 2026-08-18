package handler

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// 测试意图：静态扫描 handler，确保心愿/菜篮子/预算已改为直接依赖拆分服务而非 FeatureService 门面。
func TestFeatureHandlerDoesNotCallFeatureServiceFacadeForSplitDomains(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot locate test file")
	}
	sourcePath := filepath.Join(filepath.Dir(filename), "feature.go")
	content, err := os.ReadFile(sourcePath)
	if err != nil {
		t.Fatalf("read feature handler source: %v", err)
	}
	source := string(content)

	// forbidden 是禁止出现的门面调用清单，任何命中都说明 handler 重新耦合回 FeatureService。
	for _, forbidden := range []string{
		"h.service.CreateWish(",
		"h.service.ListWishes(",
		"h.service.CompleteWish(",
		"h.service.DeleteWish(",
		"h.service.AddToBasket(",
		"h.service.ListBasket(",
		"h.service.ToggleBasketPurchased(",
		"h.service.DeleteBasket(",
		"h.service.SetBudget(",
		"h.service.GetBudget(",
	} {
		if strings.Contains(source, forbidden) {
			t.Fatalf("feature handler must use split domain services directly, found facade call %q", forbidden)
		}
	}

	// required 是必须保留的拆分服务字段，关键断言是 handler 依赖方向明确。
	for _, required := range []string{
		"wishService   *service.WishService",
		"basketService *service.BasketService",
		"budgetService *service.BudgetService",
	} {
		if !strings.Contains(source, required) {
			t.Fatalf("feature handler must keep direct split service dependency %q", required)
		}
	}
}
