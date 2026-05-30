package models

import (
	"time"

	"github.com/google/uuid"
)

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
