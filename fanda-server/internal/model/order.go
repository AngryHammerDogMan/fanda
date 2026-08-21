package model

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Order 订单表；table_id 作为餐桌边界，pending/confirmed 等状态驱动一起吃确认流程。
type Order struct {
	ID               uuid.UUID          `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	CreatorID        uuid.UUID          `gorm:"type:uuid;not null;index" json:"creator_id"`
	TableID          uuid.UUID          `gorm:"type:uuid;not null;index" json:"table_id"`
	DineMode         string             `gorm:"type:varchar(10);not null" json:"dine_mode"`                // together / solo
	Status           string             `gorm:"type:varchar(15);not null;default:'pending'" json:"status"` // pending / confirmed / rejected / cancelled / voted
	TotalAmount      *float64           `gorm:"type:decimal(10,2)" json:"total_amount"`
	VoteDeadline     *time.Time         `json:"vote_deadline"`
	CalendarRecordID *uuid.UUID         `gorm:"type:uuid" json:"calendar_record_id"`
	CreatedAt        time.Time          `json:"created_at"`
	OrderItems       []OrderItem        `gorm:"foreignKey:OrderID" json:"order_items,omitempty"`
	Participants     []OrderParticipant `gorm:"foreignKey:OrderID" json:"participants,omitempty"`
}

func (Order) TableName() string { return "orders" }

// OrderItem 订单菜品关联表；UnitPrice 保存下单时参考单价快照，ConfirmedAmount 保存该订单项本次合计实际金额。
type OrderItem struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrderID         uuid.UUID `gorm:"type:uuid;not null;index" json:"order_id"`
	DishID          uuid.UUID `gorm:"type:uuid;not null" json:"dish_id"`
	Quantity        int       `gorm:"default:1" json:"quantity"`
	UnitPrice       *float64  `gorm:"type:decimal(10,2)" json:"unit_price"`
	ConfirmedAmount *float64  `gorm:"type:decimal(10,2)" json:"confirmed_amount"`
}

func (OrderItem) TableName() string { return "order_items" }

// OrderParticipant 订单参与人表；用于多人餐桌的一起吃邀请状态。
type OrderParticipant struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrderID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_order_participant_user" json:"order_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_order_participant_user" json:"user_id"`
	Status    string    `gorm:"type:varchar(15);not null;default:'invited'" json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (OrderParticipant) TableName() string { return "order_participants" }

// OrderVote 订单投票表（饭搭子）；order_id + user_id 唯一，支持用户改票但不重复计票。
type OrderVote struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	OrderID   uuid.UUID `gorm:"type:uuid;not null;index:idx_order_vote" json:"order_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_order_vote_user" json:"user_id"`
	Vote      string    `gorm:"type:varchar(10);not null" json:"vote"` // approve / reject / skip
	CreatedAt time.Time `json:"created_at"`
}

func (OrderVote) TableName() string { return "order_votes" }

// CalendarRecord 日历记录表；按餐桌和日期归档每餐记录，可关联照片、留言和订单来源。
type CalendarRecord struct {
	ID         uuid.UUID       `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID     uuid.UUID       `gorm:"type:uuid;not null;index:idx_calendar_user" json:"user_id"`
	TableID    uuid.UUID       `gorm:"type:uuid;not null;index:idx_calendar_table" json:"table_id"`
	RecordDate time.Time       `gorm:"type:date;not null;index:idx_calendar_table" json:"record_date"`
	MealType   string          `gorm:"type:varchar(10);not null" json:"meal_type"` // cook / takeout / dineout
	MealPeriod string          `gorm:"type:varchar(10)" json:"meal_period"`        // breakfast / lunch / dinner / snack
	DishIDs    pq.StringArray  `gorm:"type:uuid[]" json:"dish_ids"`
	Restaurant string          `gorm:"type:varchar(100)" json:"restaurant"`
	Amount     *float64        `gorm:"type:decimal(10,2)" json:"amount"`
	Source     string          `gorm:"type:varchar(10);default:'manual'" json:"source"` // manual / order
	Status     string          `gorm:"type:varchar(15);not null;default:'confirmed'" json:"status"`
	CreatedAt  time.Time       `json:"created_at"`
	Photos     []RecordPhoto   `gorm:"foreignKey:RecordID" json:"photos,omitempty"`
	Comments   []RecordComment `gorm:"foreignKey:RecordID" json:"comments,omitempty"`
}

func (CalendarRecord) TableName() string { return "calendar_records" }

// RecordPhoto 记录照片表；SortOrder 保留同一记录下的前端展示顺序。
type RecordPhoto struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	RecordID  uuid.UUID `gorm:"type:uuid;not null;index" json:"record_id"`
	URL       string    `gorm:"type:varchar(500);not null" json:"url"`
	Type      string    `gorm:"type:varchar(10);default:'image'" json:"type"` // image / video
	SortOrder int       `gorm:"default:0" json:"sort_order"`
}

func (RecordPhoto) TableName() string { return "record_photos" }

// RecordComment 记录留言表；留言归属于记录和发表用户。
type RecordComment struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	RecordID  uuid.UUID `gorm:"type:uuid;not null;index" json:"record_id"`
	UserID    uuid.UUID `gorm:"type:uuid;not null" json:"user_id"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

func (RecordComment) TableName() string { return "record_comments" }
