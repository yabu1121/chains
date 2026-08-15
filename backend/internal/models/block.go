package models

import (
	"time"

	"github.com/google/uuid"
)

// Block is a directional block: BlockerID has blocked BlockedID.
type Block struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	BlockerID uuid.UUID `gorm:"type:uuid;not null"`
	BlockedID uuid.UUID `gorm:"type:uuid;not null"`
	CreatedAt time.Time
}

func (Block) TableName() string { return "blocks" }
