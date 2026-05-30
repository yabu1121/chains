package models

import (
	"time"

	"github.com/google/uuid"
)

// UserAvatar stores a user's profile image bytes. One row per user; the matching
// users.avatar_updated_at column mirrors UpdatedAt so callers can detect an
// avatar without loading the blob.
type UserAvatar struct {
	UserID      uuid.UUID `gorm:"type:uuid;primaryKey"`
	Data        []byte    `gorm:"not null"`
	ContentType string    `gorm:"not null"`
	UpdatedAt   time.Time `gorm:"not null"`
}

func (UserAvatar) TableName() string { return "user_avatars" }
