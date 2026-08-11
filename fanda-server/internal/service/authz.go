package service

import (
	"context"
	"errors"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

var (
	// ErrForbidden 表示用户身份有效，但不属于目标情侣/饭搭子组合。
	ErrForbidden = errors.New("无权访问该资源")
	// ErrNotFound 表示资源本身不存在，调用方通常映射为 404 或业务“不存在”提示。
	ErrNotFound = errors.New("资源不存在")
)

// CanAccessGroup 是组合级鉴权入口：情侣校验双方成员，饭搭子校验 active 群成员。
func CanAccessGroup(ctx context.Context, uid uuid.UUID, groupType string, groupID uuid.UUID) error {
	if uid == uuid.Nil || groupID == uuid.Nil {
		return ErrForbidden
	}

	var count int64
	switch groupType {
	case "couple":
		err := database.DB.WithContext(ctx).Model(&model.Couple{}).
			Where("id = ? AND status = 'active' AND (user1_id = ? OR user2_id = ?)", groupID, uid, uid).
			Count(&count).Error
		if err != nil {
			return err
		}
	case "buddy":
		err := database.DB.WithContext(ctx).Model(&model.BuddyMember{}).
			Joins("JOIN buddy_groups ON buddy_groups.id = buddy_members.group_id").
			Where("buddy_members.group_id = ? AND buddy_members.user_id = ? AND buddy_groups.status = 'active'", groupID, uid).
			Count(&count).Error
		if err != nil {
			return err
		}
	default:
		return ErrForbidden
	}

	if count == 0 {
		return ErrForbidden
	}
	return nil
}

// CanAccessTable 校验用户是否为活跃餐桌的活跃成员，是新餐桌模型的统一鉴权入口。
func CanAccessTable(ctx context.Context, uid uuid.UUID, tableID uuid.UUID) error {
	if uid == uuid.Nil || tableID == uuid.Nil {
		return errors.New("餐桌不存在")
	}

	var count int64
	err := database.DB.WithContext(ctx).Model(&model.TableMember{}).
		Joins("JOIN tables ON tables.id = table_members.table_id").
		Where("table_members.table_id = ? AND table_members.user_id = ? AND table_members.status = 'active' AND tables.status = 'active'", tableID, uid).
		Count(&count).Error
	if err != nil {
		return err
	}
	if count == 0 {
		return errors.New("无权访问该餐桌")
	}
	return nil
}

// CanAccessDish 先读取菜品归属，再复用组合鉴权，避免越权访问其他组合菜品。
func CanAccessDish(ctx context.Context, uid uuid.UUID, dishID uuid.UUID) (*model.Dish, error) {
	var dish model.Dish
	if err := database.DB.WithContext(ctx).Where("id = ? AND is_deleted = false", dishID).First(&dish).Error; err != nil {
		return nil, ErrNotFound
	}
	if err := CanAccessGroup(ctx, uid, dish.GroupType, dish.GroupID); err != nil {
		return nil, err
	}
	return &dish, nil
}

// CanAccessOrder 先读取订单归属，再复用组合鉴权，供详情、状态流转和投票使用。
func CanAccessOrder(ctx context.Context, uid uuid.UUID, orderID uuid.UUID) (*model.Order, error) {
	var order model.Order
	if err := database.DB.WithContext(ctx).First(&order, "id = ?", orderID).Error; err != nil {
		return nil, ErrNotFound
	}
	if err := CanAccessGroup(ctx, uid, order.GroupType, order.GroupID); err != nil {
		return nil, err
	}
	return &order, nil
}

// CanAccessRecord 先读取日历记录归属，再复用组合鉴权，供详情、留言和统计使用。
func CanAccessRecord(ctx context.Context, uid uuid.UUID, recordID uuid.UUID) (*model.CalendarRecord, error) {
	var record model.CalendarRecord
	if err := database.DB.WithContext(ctx).First(&record, "id = ?", recordID).Error; err != nil {
		return nil, ErrNotFound
	}
	if err := CanAccessGroup(ctx, uid, record.GroupType, record.GroupID); err != nil {
		return nil, err
	}
	return &record, nil
}
