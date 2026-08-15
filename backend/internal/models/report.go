package models

import (
	"time"

	"github.com/google/uuid"
)

// Report is one user flagging another for review. Status tracks moderation:
// open → reviewed → actioned / dismissed.
type Report struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey"`
	ReporterID uuid.UUID `gorm:"type:uuid;not null"`
	ReportedID uuid.UUID `gorm:"type:uuid;not null"`
	Reason     string    `gorm:"not null"`
	Details    string    `gorm:"not null;default:''"`
	Status     string    `gorm:"not null;default:'open'"`
	CreatedAt  time.Time
}

func (Report) TableName() string { return "reports" }
