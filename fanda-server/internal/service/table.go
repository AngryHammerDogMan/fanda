package service

import (
	"context"
	"errors"
	"strings"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TableService 管理当前用户可访问的餐桌列表、默认个人餐桌和餐桌基础属性。
type TableService struct{}

// NewTableService 创建餐桌服务实例。
func NewTableService() *TableService {
	return &TableService{}
}

// isUniqueConstraintError 粗略识别不同数据库驱动返回的唯一约束冲突，用于并发创建幂等重试。
func isUniqueConstraintError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique") || strings.Contains(msg, "duplicate")
}

// CreateCoupleTable 在既有情侣关系事务中同步创建对应餐桌和双方成员。
func (s *TableService) CreateCoupleTable(ctx context.Context, tx *gorm.DB, coupleID, inviterID, partnerID uuid.UUID) error {
	table := model.Table{
		ID:      coupleID,
		Type:    "couple",
		Name:    "情侣餐桌",
		OwnerID: inviterID,
		Status:  "active",
	}
	if err := tx.WithContext(ctx).Create(&table).Error; err != nil {
		return err
	}
	members := []model.TableMember{
		{ID: uuid.New(), TableID: coupleID, UserID: inviterID, Role: "owner", Status: "active"},
		{ID: uuid.New(), TableID: coupleID, UserID: partnerID, Role: "member", Status: "active"},
	}
	return tx.WithContext(ctx).Create(&members).Error
}

// CreateBuddyTable 在饭搭子组合创建事务中同步创建对应餐桌和 owner 成员。
func (s *TableService) CreateBuddyTable(ctx context.Context, tx *gorm.DB, groupID, ownerID uuid.UUID, name string) error {
	table := model.Table{
		ID:      groupID,
		Type:    "buddy",
		Name:    name,
		OwnerID: ownerID,
		Status:  "active",
	}
	if err := tx.WithContext(ctx).Create(&table).Error; err != nil {
		return err
	}
	member := model.TableMember{ID: uuid.New(), TableID: groupID, UserID: ownerID, Role: "owner", Status: "active"}
	return tx.WithContext(ctx).Create(&member).Error
}

// AddBuddyTableMember 在饭搭子加入事务中同步追加餐桌成员。
func (s *TableService) AddBuddyTableMember(ctx context.Context, tx *gorm.DB, groupID, userID uuid.UUID, role string) error {
	member := model.TableMember{ID: uuid.New(), TableID: groupID, UserID: userID, Role: role, Status: "active"}
	return tx.WithContext(ctx).Create(&member).Error
}

// findPersonalTable 通过 table_members 反查用户当前 active 个人餐桌。
func (s *TableService) findPersonalTable(ctx context.Context, uid uuid.UUID) (*model.Table, error) {
	var table model.Table
	err := database.DB.WithContext(ctx).
		Joins("JOIN table_members ON table_members.table_id = tables.id").
		Where("tables.type = ? AND tables.status = ? AND table_members.user_id = ? AND table_members.status = ?", "personal", "active", uid, "active").
		First(&table).Error
	if err != nil {
		return nil, err
	}
	return &table, nil
}

// EnsurePersonalTable 确保用户拥有一个 active 个人餐桌；已有则复用，缺失则原子创建餐桌与 owner 成员。
func (s *TableService) EnsurePersonalTable(ctx context.Context, uid uuid.UUID) (*model.Table, error) {
	if uid == uuid.Nil {
		return nil, errors.New("用户不存在")
	}

	table, err := s.findPersonalTable(ctx, uid)
	if err == nil {
		return table, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	newTable := model.Table{
		ID:      uuid.New(),
		Type:    "personal",
		Name:    "我的餐桌",
		OwnerID: uid,
		Status:  "active",
	}
	member := model.TableMember{
		ID:      uuid.New(),
		TableID: newTable.ID,
		UserID:  uid,
		Role:    "owner",
		Status:  "active",
	}

	tx := database.DB.WithContext(ctx).Begin()
	if err := tx.Create(&newTable).Error; err != nil {
		tx.Rollback()
		if isUniqueConstraintError(err) {
			return s.findPersonalTable(ctx, uid)
		}
		return nil, err
	}
	if err := tx.Create(&member).Error; err != nil {
		tx.Rollback()
		if isUniqueConstraintError(err) {
			return s.findPersonalTable(ctx, uid)
		}
		return nil, err
	}
	if err := tx.Commit().Error; err != nil {
		if isUniqueConstraintError(err) {
			return s.findPersonalTable(ctx, uid)
		}
		return nil, err
	}
	return &newTable, nil
}

// ListTables 返回用户所有 active 餐桌，并自动补齐个人餐桌作为默认空间。
func (s *TableService) ListTables(ctx context.Context, uid uuid.UUID) ([]model.Table, error) {
	if _, err := s.EnsurePersonalTable(ctx, uid); err != nil {
		return nil, err
	}

	var tables []model.Table
	err := database.DB.WithContext(ctx).
		Preload("Members", "status = ?", "active").
		Joins("JOIN table_members ON table_members.table_id = tables.id").
		Where("table_members.user_id = ? AND table_members.status = ? AND tables.status = ?", uid, "active", "active").
		Order("CASE tables.type WHEN 'personal' THEN 1 WHEN 'couple' THEN 2 ELSE 3 END, tables.created_at ASC").
		Find(&tables).Error
	return tables, err
}

// RenameTable 允许餐桌创建者重命名自己有权限访问的餐桌。
func (s *TableService) RenameTable(ctx context.Context, uid uuid.UUID, tableID uuid.UUID, name string) (*model.Table, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errors.New("餐桌名称不能为空")
	}
	if err := CanAccessTable(ctx, uid, tableID); err != nil {
		return nil, err
	}

	var table model.Table
	if err := database.DB.WithContext(ctx).First(&table, "id = ?", tableID).Error; err != nil {
		return nil, errors.New("餐桌不存在")
	}
	if table.OwnerID != uid {
		return nil, errors.New("只有餐桌创建者可以重命名")
	}
	if err := database.DB.WithContext(ctx).Model(&table).Update("name", name).Error; err != nil {
		return nil, err
	}
	table.Name = name
	return &table, nil
}
