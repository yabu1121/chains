package models

import (
	"time"

	"github.com/google/uuid"
)

// Beacon is a user's single active "ok to talk to me about this" signal. It
// expires at ExpiresAt; expired rows are simply filtered out (and overwritten on
// the next beacon).
type Beacon struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"`
	Message   string    `gorm:"not null"`
	CreatedAt time.Time
	ExpiresAt time.Time `gorm:"not null"`
}

func (Beacon) TableName() string { return "beacons" }
