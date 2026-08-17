package handler

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

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
