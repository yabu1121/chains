package models

import (
	"time"

	"github.com/google/uuid"
)

// FollowUpStatus is the workflow state of a note's follow-up. It replaces the
// old boolean so a flagged person can be processed ("contacted", "snoozed",
// "dismissed") rather than sitting in the list forever.
type FollowUpStatus string

const (
	// FollowUpNone — no follow-up wanted.
	FollowUpNone FollowUpStatus = "none"
	// FollowUpPending — you want to reach out (shows in "people to follow up with").
	FollowUpPending FollowUpStatus = "pending"
	// FollowUpContacted — you've reached out; done.
	FollowUpContacted FollowUpStatus = "contacted"
	// FollowUpSnoozed — remind me later (resurfaces when DueOn arrives).
	FollowUpSnoozed FollowUpStatus = "snoozed"
	// FollowUpDismissed — no longer needed.
	FollowUpDismissed FollowUpStatus = "dismissed"
)

// Valid reports whether s is a known follow-up status.
func (s FollowUpStatus) Valid() bool {
	switch s {
	case FollowUpNone, FollowUpPending, FollowUpContacted, FollowUpSnoozed, FollowUpDismissed:
		return true
	default:
		return false
	}
}

// Note is a private interaction log OwnerID keeps about TargetID — never visible
// to anyone but the owner. One row per (owner, target) pair.
type Note struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey"`
	OwnerID       uuid.UUID `gorm:"type:uuid;not null"`
	TargetID      uuid.UUID `gorm:"type:uuid;not null"`
	WhereMet      string    `gorm:"not null;default:''"`
	WhatDiscussed string    `gorm:"not null;default:''"`
	// TopicTags are short labels for what you talked about, stored as a JSON array.
	TopicTags      []string       `gorm:"serializer:json;not null;default:'[]'"`
	NextAction     string         `gorm:"not null;default:''"`
	MetOn          *time.Time     `gorm:"type:date"`
	DueOn          *time.Time     `gorm:"type:date"`
	FollowUpStatus FollowUpStatus `gorm:"type:text;not null;default:'none'"`
	Memo           string         `gorm:"not null;default:''"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (Note) TableName() string { return "notes" }
