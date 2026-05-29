package models

import (
	"time"

	"github.com/google/uuid"
)

// UserLanguage is one programming language a user has listed. Position keeps
// the user's chosen ordering.
type UserLanguage struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID    uuid.UUID `gorm:"type:uuid;not null"`
	Language  string    `gorm:"not null"`
	Position  int       `gorm:"not null;default:0"`
	CreatedAt time.Time
}

func (UserLanguage) TableName() string { return "user_languages" }
