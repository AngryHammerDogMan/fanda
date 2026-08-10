package service

const (
	defaultPage     = 1
	defaultPageSize = 20
	maxPageSize     = 100
)

func NormalizePagination(page, pageSize int) (int, int) {
	if page < 1 {
		page = defaultPage
	}
	if pageSize < 1 || pageSize > maxPageSize {
		pageSize = defaultPageSize
	}
	return page, pageSize
}
