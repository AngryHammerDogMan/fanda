package service

import (
	"math"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeAmount(t *testing.T) {
	tests := []struct {
		name    string
		input   *float64
		want    *float64
		wantErr string
	}{
		{name: "nil", input: nil, want: nil},
		{name: "zero", input: amountPtr(0), want: amountPtr(0)},
		{name: "two decimals", input: amountPtr(12.34), want: amountPtr(12.34)},
		{name: "decimal upper bound", input: amountPtr(99999999.99), want: amountPtr(99999999.99)},
		{name: "above decimal upper bound", input: amountPtr(100000000), wantErr: "金额不能超过 99999999.99"},
		{name: "negative", input: amountPtr(-0.01), wantErr: "金额不能小于 0"},
		{name: "three decimals", input: amountPtr(12.345), wantErr: "金额最多保留两位小数"},
		{name: "nan", input: amountPtr(math.NaN()), wantErr: "金额必须是有效数字"},
		{name: "infinity", input: amountPtr(math.Inf(1)), wantErr: "金额必须是有效数字"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeAmount(tt.input)
			if tt.wantErr != "" {
				require.EqualError(t, err, tt.wantErr)
				return
			}
			require.NoError(t, err)
			if tt.want == nil {
				require.Nil(t, got)
				return
			}
			require.NotNil(t, got)
			require.Equal(t, *tt.want, *got)
		})
	}
}

func TestSumAmountsPreservesNullAndZero(t *testing.T) {
	tests := []struct {
		name   string
		values []*float64
		want   *float64
	}{
		{name: "all nil", values: []*float64{nil, nil}, want: nil},
		{name: "zero is present", values: []*float64{amountPtr(0), nil}, want: amountPtr(0)},
		{name: "sums non nil", values: []*float64{amountPtr(10.10), nil, amountPtr(2.20)}, want: amountPtr(12.30)},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sumAmounts(tt.values)
			if tt.want == nil {
				require.Nil(t, got)
				return
			}
			require.NotNil(t, got)
			require.Equal(t, *tt.want, *got)
		})
	}
}

func amountPtr(value float64) *float64 {
	return &value
}
