package models

import (
	"time"

	"github.com/google/uuid"
)

// Bridge records an introduction the introducer made between two of their
// friends. Each side also receives an intro Connection Card.
type Bridge struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	IntroducerID uuid.UUID `gorm:"type:uuid;not null"`
	UserAID      uuid.UUID `gorm:"type:uuid;not null"`
	UserBID      uuid.UUID `gorm:"type:uuid;not null"`
	Reason       string    `gorm:"not null;default:''"`
	CreatedAt    time.Time
}

func (Bridge) TableName() string { return "bridges" }
