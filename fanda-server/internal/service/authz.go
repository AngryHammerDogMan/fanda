package service

import (
	"context"
	"errors"

	"fanda-server/internal/database"
	"fanda-server/internal/model"

	"github.com/google/uuid"
)

var (
	ErrForbidden = errors.New("无权访问该资源")
	ErrNotFound  = errors.New("资源不存在")
)

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
