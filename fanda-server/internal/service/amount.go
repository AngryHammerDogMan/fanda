package service

import (
	"errors"
	"math"
)

const maxDatabaseAmount = 99999999.99

type amountValidationError struct {
	err error
}

func (e *amountValidationError) Error() string { return e.err.Error() }
func (e *amountValidationError) Unwrap() error { return e.err }

func newAmountValidationError(message string) error {
	return &amountValidationError{err: errors.New(message)}
}

// IsAmountValidationError 判断错误是否由金额格式或取值范围校验产生。
func IsAmountValidationError(err error) bool {
	var validationErr *amountValidationError
	return errors.As(err, &validationErr)
}

func normalizeAmount(value *float64) (*float64, error) {
	if value == nil {
		return nil, nil
	}
	if math.IsNaN(*value) || math.IsInf(*value, 0) {
		return nil, newAmountValidationError("金额必须是有效数字")
	}
	if *value < 0 {
		return nil, newAmountValidationError("金额不能小于 0")
	}
	rounded := roundAmount(*value)
	if math.Abs(*value-rounded) > 1e-9 {
		return nil, newAmountValidationError("金额最多保留两位小数")
	}
	if rounded > maxDatabaseAmount {
		return nil, newAmountValidationError("金额不能超过 99999999.99")
	}
	return &rounded, nil
}

func sumAmounts(values []*float64) *float64 {
	total := 0.0
	hasAmount := false
	for _, value := range values {
		if value == nil {
			continue
		}
		hasAmount = true
		total += *value
	}
	if !hasAmount {
		return nil
	}
	total = roundAmount(total)
	return &total
}

func validateAmountTotal(value *float64) error {
	if value != nil && *value > maxDatabaseAmount {
		return errors.New("金额不能超过 99999999.99")
	}
	return nil
}

func roundAmount(value float64) float64 {
	return math.Round(value*100) / 100
}
