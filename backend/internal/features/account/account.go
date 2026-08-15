// Package account holds whole-account operations. Today that is data export: a
// user can download everything chains holds about them as JSON — a launch
// baseline for data ownership and portability (complementing account deletion,
// which lives in the auth slice).
package account

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

// Export is the full snapshot of a user's data.
type Export struct {
	ExportedAt    time.Time      `json:"exported_at"`
	Profile       ProfileData    `json:"profile"`
	Languages     []string       `json:"languages"`
	Friends       []PersonRef    `json:"friends"`
	Notes         []NoteData     `json:"notes"`
	SavedArticles []SavedData    `json:"saved_articles"`
	Communities   []CommunityRef `json:"communities"`
}

// ProfileData is the user's own profile, including private fields (email).
type ProfileData struct {
	ID            uuid.UUID `json:"id"`
	Email         string    `json:"email"`
	Username      string    `json:"username"`
	DisplayName   string    `json:"display_name"`
	JobTitle      string    `json:"job_title"`
	StatusMessage string    `json:"status_message"`
	Interests     string    `json:"interests"`
	LookingFor    string    `json:"looking_for"`
	CanHelpWith   string    `json:"can_help_with"`
	BuildingNow   string    `json:"building_now"`
	XHandle       string    `json:"x_handle"`
	GithubHandle  string    `json:"github_handle"`
	ZennHandle    string    `json:"zenn_handle"`
	LinkedinURL   string    `json:"linkedin_url"`
	PortfolioURL  string    `json:"portfolio_url"`
	CreatedAt     time.Time `json:"created_at"`
}

// PersonRef is a minimal reference to another user.
type PersonRef struct {
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
}

// NoteData is one private note the user wrote.
type NoteData struct {
	TargetUsername string     `json:"target_username"`
	WhereMet       string     `json:"where_met"`
	WhatDiscussed  string     `json:"what_discussed"`
	NextAction     string     `json:"next_action"`
	MetOn          *time.Time `json:"met_on"`
	DueOn          *time.Time `json:"due_on"`
	FollowUpStatus string     `json:"follow_up_status"`
	Memo           string     `json:"memo"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// SavedData is one saved article.
type SavedData struct {
	URL     string    `json:"url"`
	Title   string    `json:"title"`
	Status  string    `json:"status"`
	SavedAt time.Time `json:"saved_at"`
}

// CommunityRef is a community the user belongs to.
type CommunityRef struct {
	Name string `json:"name"`
}

// Repository gathers a user's data for export.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Service assembles an export.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Export gathers everything chains holds about the user.
func (s *Service) Export(ctx context.Context, userID uuid.UUID, now time.Time) (*Export, error) {
	db := s.repo.db.WithContext(ctx)

	var u models.User
	if err := db.First(&u, "id = ?", userID).Error; err != nil {
		return nil, httperr.Internal("could not load profile").Wrap(err)
	}

	var languages []string
	if err := db.Model(&models.UserLanguage{}).
		Where("user_id = ?", userID).Order("position ASC").
		Pluck("language", &languages).Error; err != nil {
		return nil, httperr.Internal("could not load languages").Wrap(err)
	}

	var friends []PersonRef
	if err := db.Raw(
		`SELECT u.username, u.display_name
		 FROM users u
		 WHERE u.id IN (
		     SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
		     FROM friendships
		     WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
		 )
		 ORDER BY u.username`,
		userID, userID, userID).Scan(&friends).Error; err != nil {
		return nil, httperr.Internal("could not load friends").Wrap(err)
	}

	var notes []NoteData
	if err := db.Raw(
		`SELECT u.username AS target_username, n.where_met, n.what_discussed,
		        n.next_action, n.met_on, n.due_on, n.follow_up_status, n.memo, n.updated_at
		 FROM notes n JOIN users u ON u.id = n.target_id
		 WHERE n.owner_id = ?
		 ORDER BY n.updated_at DESC`,
		userID).Scan(&notes).Error; err != nil {
		return nil, httperr.Internal("could not load notes").Wrap(err)
	}

	var saved []SavedData
	if err := db.Model(&models.SavedArticle{}).
		Select("url, title, status, created_at AS saved_at").
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Scan(&saved).Error; err != nil {
		return nil, httperr.Internal("could not load saved articles").Wrap(err)
	}

	var communities []CommunityRef
	if err := db.Raw(
		`SELECT c.name FROM communities c
		 JOIN community_members cm ON cm.community_id = c.id
		 WHERE cm.user_id = ?
		 ORDER BY c.name`,
		userID).Scan(&communities).Error; err != nil {
		return nil, httperr.Internal("could not load communities").Wrap(err)
	}

	return &Export{
		ExportedAt: now,
		Profile: ProfileData{
			ID:            u.ID,
			Email:         u.Email,
			Username:      u.Username,
			DisplayName:   u.DisplayName,
			JobTitle:      u.JobTitle,
			StatusMessage: u.StatusMessage,
			Interests:     u.Interests,
			LookingFor:    u.LookingFor,
			CanHelpWith:   u.CanHelpWith,
			BuildingNow:   u.BuildingNow,
			XHandle:       u.XHandle,
			GithubHandle:  u.GithubHandle,
			ZennHandle:    u.ZennHandle,
			LinkedinURL:   u.LinkedinURL,
			PortfolioURL:  u.PortfolioURL,
			CreatedAt:     u.CreatedAt,
		},
		Languages:     emptyIfNil(languages),
		Friends:       friends,
		Notes:         notes,
		SavedArticles: saved,
		Communities:   communities,
	}, nil
}

func emptyIfNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// Handler exposes the account endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the account routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/me/export", h.Export, authmw)
}

// Export handles GET /me/export, returning a downloadable JSON file.
func (h *Handler) Export(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	data, err := h.svc.Export(c.Request().Context(), userID, time.Now().UTC())
	if err != nil {
		return err
	}
	c.Response().Header().Set(echo.HeaderContentDisposition, `attachment; filename="chains-export.json"`)
	return c.JSON(http.StatusOK, data)
}
