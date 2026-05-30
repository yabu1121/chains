package models

import (
	"time"

	"github.com/google/uuid"
)

// Visibility controls who may see an individual profile field: everyone, the
// owner's accepted friends, or no one but the owner.
type Visibility string

const (
	VisibilityPublic  Visibility = "public"
	VisibilityFriends Visibility = "friends"
	VisibilityPrivate Visibility = "private"
)

// Valid reports whether v is one of the known visibility levels.
func (v Visibility) Valid() bool {
	switch v {
	case VisibilityPublic, VisibilityFriends, VisibilityPrivate:
		return true
	default:
		return false
	}
}

// User is an application account.
type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey"`
	Email        string    `gorm:"uniqueIndex;not null"`
	Username     string    `gorm:"uniqueIndex;not null"`
	PasswordHash string    `gorm:"not null"`
	DisplayName  string    `gorm:"not null"`

	// Profile fields. Handles are stored bare; URLs are stored whole.
	JobTitle      string `gorm:"not null;default:''"`
	StatusMessage string `gorm:"not null;default:''"`
	XHandle       string `gorm:"column:x_handle;not null;default:''"`
	GithubHandle  string `gorm:"column:github_handle;not null;default:''"`
	ZennHandle    string `gorm:"column:zenn_handle;not null;default:''"`
	LinkedinURL   string `gorm:"column:linkedin_url;not null;default:''"`
	PortfolioURL  string `gorm:"column:portfolio_url;not null;default:''"`

	// Per-link visibility. Each account link is independently shown to everyone,
	// to accepted friends only, or to no one but the owner. Defaults to
	// VisibilityFriends to preserve the original friends-only link behaviour.
	XHandleVisibility      Visibility `gorm:"column:x_handle_visibility;type:text;not null;default:'friends'"`
	GithubHandleVisibility Visibility `gorm:"column:github_handle_visibility;type:text;not null;default:'friends'"`
	ZennHandleVisibility   Visibility `gorm:"column:zenn_handle_visibility;type:text;not null;default:'friends'"`
	LinkedinURLVisibility  Visibility `gorm:"column:linkedin_url_visibility;type:text;not null;default:'friends'"`
	PortfolioURLVisibility Visibility `gorm:"column:portfolio_url_visibility;type:text;not null;default:'friends'"`

	// Optional birth date with independent visibility for the derived age and
	// the exact date. ShowAge defaults true, ShowBirthDate defaults false.
	BirthDate     *time.Time `gorm:"type:date"`
	ShowAge       bool       `gorm:"not null;default:true"`
	ShowBirthDate bool       `gorm:"not null;default:false"`

	// Set when the user has an avatar (see UserAvatar); nil otherwise. Doubles
	// as a cache-busting version for the avatar URL.
	AvatarUpdatedAt *time.Time `gorm:"column:avatar_updated_at"`

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (User) TableName() string { return "users" }
