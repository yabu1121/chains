package models

import (
	"time"

	"github.com/google/uuid"
)

// FriendshipStatus is the lifecycle state of a friendship row.
type FriendshipStatus string

const (
	FriendshipPending  FriendshipStatus = "pending"
	FriendshipAccepted FriendshipStatus = "accepted"
)

// Friendship represents a symmetric relationship between two users. A single
// row covers both directions; RequesterID records who initiated the request.
type Friendship struct {
	ID          uuid.UUID        `gorm:"type:uuid;primaryKey"`
	RequesterID uuid.UUID        `gorm:"type:uuid;not null"`
	AddresseeID uuid.UUID        `gorm:"type:uuid;not null"`
	Status      FriendshipStatus `gorm:"type:text;not null"`
	// Message is an optional note the requester attached when sending the
	// request. Empty string means no message.
	Message     string `gorm:"type:text;not null;default:''"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	AcceptedAt  *time.Time

	Requester *User `gorm:"foreignKey:RequesterID"`
	Addressee *User `gorm:"foreignKey:AddresseeID"`
}

func (Friendship) TableName() string { return "friendships" }
