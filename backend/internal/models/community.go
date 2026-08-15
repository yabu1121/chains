package models

import (
	"time"

	"github.com/google/uuid"
)

// Community is a named group people join — a tech event, hackathon, school, lab
// or community — that carries its own roster and relationship sub-graph.
type Community struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	Name        string    `gorm:"not null"`
	Description string    `gorm:"not null;default:''"`
	CreatedBy   uuid.UUID `gorm:"type:uuid;not null"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (Community) TableName() string { return "communities" }

// CommunityMember is a user's membership in a community.
type CommunityMember struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey"`
	CommunityID uuid.UUID `gorm:"type:uuid;not null"`
	UserID      uuid.UUID `gorm:"type:uuid;not null"`
	JoinedAt    time.Time
}

func (CommunityMember) TableName() string { return "community_members" }
