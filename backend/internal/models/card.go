package models

import (
	"time"

	"github.com/google/uuid"
)

// Card is a private Connection Card sent from SenderID to RecipientID. ReadAt is
// nil until the recipient opens it.
type Card struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	SenderID     uuid.UUID `gorm:"type:uuid;not null"`
	RecipientID  uuid.UUID `gorm:"type:uuid;not null"`
	Type         string    `gorm:"not null"`
	Topic        string    `gorm:"not null;default:''"`
	Tags         []string  `gorm:"serializer:json;not null;default:'[]'"`
	ArticleURL   string    `gorm:"not null;default:''"`
	ArticleTitle string    `gorm:"not null;default:''"`
	NextAction   string    `gorm:"not null;default:''"`
	Message      string    `gorm:"not null;default:''"`
	// Template is the visual structure family, Theme the colour palette, and
	// Layout a JSON descriptor (which blocks to show, accent, titles) — together
	// they let the card render identically everywhere it appears.
	Template  string `gorm:"not null;default:'classic'"`
	Theme     string `gorm:"not null;default:'paper'"`
	Layout    string `gorm:"not null;default:'{}'"`
	ReadAt    *time.Time
	CreatedAt time.Time
}

func (Card) TableName() string { return "cards" }
