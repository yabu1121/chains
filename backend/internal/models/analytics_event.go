package models

import (
	"time"

	"github.com/google/uuid"
)

// AnalyticsEvent is one first-party product analytics event. Props holds a small
// JSON object of context. UserID is nullable so events can survive account
// deletion (set null) for aggregate retention maths.
type AnalyticsEvent struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey"`
	UserID    *uuid.UUID `gorm:"type:uuid"`
	Name      string     `gorm:"not null"`
	Props     string     `gorm:"not null;default:'{}'"`
	CreatedAt time.Time
}

func (AnalyticsEvent) TableName() string { return "analytics_events" }
