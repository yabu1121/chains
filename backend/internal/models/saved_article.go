package models

import (
	"time"

	"github.com/google/uuid"
)

// SavedArticleStatus is the lifecycle state of a saved article.
type SavedArticleStatus string

const (
	// SavedUnread is an article saved for later reading.
	SavedUnread SavedArticleStatus = "unread"
	// SavedRead is an article the user has marked as read.
	SavedRead SavedArticleStatus = "read"
	// SavedHidden is an article the user dismissed; it is kept so the feed never
	// resurfaces it, but it is not part of the reading list.
	SavedHidden SavedArticleStatus = "hidden"
)

// Valid reports whether s is a known status.
func (s SavedArticleStatus) Valid() bool {
	switch s {
	case SavedUnread, SavedRead, SavedHidden:
		return true
	default:
		return false
	}
}

// SavedArticle is one article a user saved (or hid) from the News feed.
type SavedArticle struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID      uuid.UUID `gorm:"type:uuid;not null"`
	URL         string    `gorm:"column:url;not null"`
	Title       string    `gorm:"not null"`
	Source      string    `gorm:"not null;default:''"`
	Author      string    `gorm:"not null;default:''"`
	Summary     string    `gorm:"not null;default:''"`
	Language    string    `gorm:"not null;default:''"`
	PublishedAt *time.Time
	Status      SavedArticleStatus `gorm:"type:text;not null;default:'unread'"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (SavedArticle) TableName() string { return "saved_articles" }
