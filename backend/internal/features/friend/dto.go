package friend

import (
	"time"

	"github.com/google/uuid"

	"github.com/cymed/chains/backend/internal/models"
)

// UserSummary is the compact, public view of a user embedded in friend/request
// lists. It exposes the handle, never the email. Languages is populated only
// for friend lists (so they can be filtered by language); it is omitted
// elsewhere.
type UserSummary struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
	Languages       []string   `json:"languages,omitempty"`
}

// FriendSummary is one accepted friend.
type FriendSummary struct {
	User         UserSummary `json:"user"`
	FriendsSince time.Time   `json:"friends_since"`
}

// RequestSummary is one pending friend request; User is the other party.
// Message is the optional note the requester attached (empty when none).
type RequestSummary struct {
	RequestID uuid.UUID   `json:"request_id"`
	User      UserSummary `json:"user"`
	Message   string      `json:"message"`
	CreatedAt time.Time   `json:"created_at"`
}

// SendRequestInput is the body for sending a friend request. Message is an
// optional short note (max 150 characters).
type SendRequestInput struct {
	AddresseeID uuid.UUID `json:"addressee_id" validate:"required"`
	Message     string    `json:"message" validate:"max=150"`
}

// BlockInput is the body for blocking a user.
type BlockInput struct {
	UserID uuid.UUID `json:"user_id" validate:"required"`
}

func userSummary(u *models.User) UserSummary {
	return UserSummary{
		ID:              u.ID,
		Username:        u.Username,
		DisplayName:     u.DisplayName,
		AvatarUpdatedAt: u.AvatarUpdatedAt,
	}
}
