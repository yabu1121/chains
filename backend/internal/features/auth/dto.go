package auth

import (
	"time"

	"github.com/google/uuid"

	"github.com/cymed/chains/backend/internal/models"
)

// RegisterRequest is the body for account creation.
type RegisterRequest struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Username string `json:"username" validate:"required,min=3,max=30"`
	// Length is authoritatively enforced in bytes by the service (bcrypt's
	// 72-byte limit); these rune-based tags are only a cheap first pass.
	Password    string `json:"password" validate:"required,min=8,max=72"`
	DisplayName string `json:"display_name" validate:"required,min=1,max=50"`
}

// DeleteAccountRequest re-confirms the caller's password before erasing their
// account (a destructive, irreversible action).
type DeleteAccountRequest struct {
	Password string `json:"password" validate:"required"`
}

// LoginRequest is the body for obtaining a token.
type LoginRequest struct {
	Email    string `json:"email" validate:"required,email,max=254"`
	Password string `json:"password" validate:"required"`
}

// UserResponse is the representation of a user's own profile (includes email).
type UserResponse struct {
	ID            uuid.UUID `json:"id"`
	Email         string    `json:"email"`
	Username      string    `json:"username"`
	DisplayName   string    `json:"display_name"`
	JobTitle      string    `json:"job_title"`
	StatusMessage string    `json:"status_message"`
	XHandle       string    `json:"x_handle"`
	GithubHandle  string    `json:"github_handle"`
	ZennHandle    string    `json:"zenn_handle"`
	LinkedinURL   string    `json:"linkedin_url"`
	PortfolioURL  string    `json:"portfolio_url"`

	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`

	CreatedAt time.Time `json:"created_at"`
}

// AuthResponse is returned by register, login and refresh. Token carries the
// short-lived access token (also set as an httpOnly cookie); the refresh token
// is never placed in the body — it lives only in its own httpOnly cookie.
type AuthResponse struct {
	Token     string       `json:"token"`
	ExpiresAt time.Time    `json:"expires_at"`
	User      UserResponse `json:"user"`
}

// Session is the internal result of authenticating: the access + refresh token
// pair and the user. The handler turns this into cookies (+ an AuthResponse).
type Session struct {
	AccessToken    string
	AccessExpires  time.Time
	RefreshToken   string
	RefreshExpires time.Time
	User           UserResponse
}

func toUserResponse(u *models.User) UserResponse {
	return UserResponse{
		ID:              u.ID,
		Email:           u.Email,
		Username:        u.Username,
		DisplayName:     u.DisplayName,
		JobTitle:        u.JobTitle,
		StatusMessage:   u.StatusMessage,
		XHandle:         u.XHandle,
		GithubHandle:    u.GithubHandle,
		ZennHandle:      u.ZennHandle,
		LinkedinURL:     u.LinkedinURL,
		PortfolioURL:    u.PortfolioURL,
		AvatarUpdatedAt: u.AvatarUpdatedAt,
		CreatedAt:       u.CreatedAt,
	}
}
