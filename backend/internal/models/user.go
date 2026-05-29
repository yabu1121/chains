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
	Bio          string `gorm:"not null;default:''"`
	XHandle      string `gorm:"column:x_handle;not null;default:''"`
	GithubHandle string `gorm:"column:github_handle;not null;default:''"`
	ZennHandle   string `gorm:"column:zenn_handle;not null;default:''"`
	LinkedinURL  string `gorm:"column:linkedin_url;not null;default:''"`
	PortfolioURL string `gorm:"column:portfolio_url;not null;default:''"`

	CreatedAt time.Time
	UpdatedAt time.Time
}

func (User) TableName() string { return "users" }
