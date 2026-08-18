package service

const (
	// defaultPage 是未传或非法页码时使用的第一页。
	defaultPage = 1
	// defaultPageSize 是未传或非法 page_size 时的默认分页大小。
	defaultPageSize = 20
	// maxPageSize 限制单次查询最大返回数量，避免列表接口被过大分页拖慢。
	maxPageSize = 100
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
