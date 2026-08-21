const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/
const MAX_AMOUNT = 99999999.99

export function getDefaultConfirmedAmount(
  price: number | null,
  quantity: number,
): string {
  return price == null ? '' : (Math.round(price * quantity * 100) / 100).toFixed(2)
}

export function validateAmountInput(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) return '请输入有效金额'
  if (amount < 0) return '金额不能小于 0'
  if (!AMOUNT_PATTERN.test(normalized)) return '金额最多保留两位小数'
  if (amount > MAX_AMOUNT) return '金额不能超过 99999999.99'
  return null
}

export function parseAmountInput(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null
  return Math.round(Number(normalized) * 100) / 100
}

export function sumNullableAmounts(values: Array<number | null>): number | null {
  let hasAmount = false
  const total = values.reduce<number>((sum, value) => {
    if (value == null) return sum
    hasAmount = true
    return sum + value
  }, 0)
  return hasAmount ? Math.round(total * 100) / 100 : null
}
