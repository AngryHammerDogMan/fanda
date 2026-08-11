package service

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

// NormalizePagination 统一分页边界：页码最小为 1，page_size 超出范围时回到默认值。
func NormalizePagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = defaultPage
	}
	if pageSize < 1 || pageSize > maxPageSize {
		pageSize = defaultPageSize
	}
	return page, pageSize
}
