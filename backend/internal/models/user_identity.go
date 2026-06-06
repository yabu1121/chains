package models

import (
	"time"

	"github.com/google/uuid"
)

// OAuth provider identifiers, stored in UserIdentity.Provider.
const (
	ProviderGitHub = "github"
	ProviderGoogle = "google"
)

// UserIdentity links an external OAuth account (GitHub, Google) to a chains
// user. (Provider, ProviderUserID) is unique: a returning OAuth login is
// matched against it. Email is the address reported by the provider at link
// time, kept for reference only — account matching uses the stable provider id,
// not the (mutable) email.
type UserIdentity struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey"`
	UserID         uuid.UUID `gorm:"type:uuid;not null"`
	Provider       string    `gorm:"not null"`
	ProviderUserID string    `gorm:"column:provider_user_id;not null"`
	Email          string    `gorm:"not null;default:''"`
	CreatedAt      time.Time
	UpdatedAt      time.Time

	User *User `gorm:"foreignKey:UserID"`
}

func (UserIdentity) TableName() string { return "user_identities" }
