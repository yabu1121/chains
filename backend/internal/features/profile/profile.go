// Package profile serves public user profiles (for tapping a node in the
// network) and lets a user edit their own profile: bio plus social handles
// (X / GitHub / Zenn stored bare) and URLs (LinkedIn / portfolio).
package profile

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/features/network"
	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

var (
	xHandlePattern      = regexp.MustCompile(`^[A-Za-z0-9_]{1,15}$`)
	githubHandlePattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)
	zennHandlePattern   = regexp.MustCompile(`^[A-Za-z0-9_]{1,30}$`)
	languagePattern     = regexp.MustCompile(`^[A-Za-z0-9+#. -]{1,40}$`)
)

const maxLanguages = 30

// PublicProfile is the publicly visible profile (no email).
type PublicProfile struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	DisplayName  string    `json:"display_name"`
	Bio          string    `json:"bio"`
	XHandle      string    `json:"x_handle"`
	GithubHandle string    `json:"github_handle"`
	ZennHandle   string    `json:"zenn_handle"`
	LinkedinURL  string    `json:"linkedin_url"`
	PortfolioURL string    `json:"portfolio_url"`
	Languages    []string  `json:"languages"`
}

// UpdateRequest is the body for editing one's own profile.
type UpdateRequest struct {
	DisplayName  string   `json:"display_name"`
	Bio          string   `json:"bio"`
	XHandle      string   `json:"x_handle"`
	GithubHandle string   `json:"github_handle"`
	ZennHandle   string   `json:"zenn_handle"`
	LinkedinURL  string   `json:"linkedin_url"`
	PortfolioURL string   `json:"portfolio_url"`
	Languages    []string `json:"languages"`
}

func toPublicProfile(u *models.User, languages []string) PublicProfile {
	if languages == nil {
		languages = []string{}
	}
	return PublicProfile{
		ID:           u.ID,
		Username:     u.Username,
		DisplayName:  u.DisplayName,
		Bio:          u.Bio,
		XHandle:      u.XHandle,
		GithubHandle: u.GithubHandle,
		ZennHandle:   u.ZennHandle,
		LinkedinURL:  u.LinkedinURL,
		PortfolioURL: u.PortfolioURL,
		Languages:    languages,
	}
}

// Repository is the profile slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// GetByID loads a user, or returns gorm.ErrRecordNotFound.
func (r *Repository) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).First(&u, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// UpdateProfile applies the given column updates to a user.
func (r *Repository) UpdateProfile(ctx context.Context, id uuid.UUID, fields map[string]any) error {
	return r.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", id).Updates(fields).Error
}

// LanguagesFor returns a user's languages in their chosen order.
func (r *Repository) LanguagesFor(ctx context.Context, userID uuid.UUID) ([]string, error) {
	var langs []string
	err := r.db.WithContext(ctx).
		Model(&models.UserLanguage{}).
		Where("user_id = ?", userID).
		Order("position ASC").
		Pluck("language", &langs).Error
	return langs, err
}

// ReplaceLanguages atomically replaces a user's languages with the given list.
func (r *Repository) ReplaceLanguages(ctx context.Context, userID uuid.UUID, languages []string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ?", userID).Delete(&models.UserLanguage{}).Error; err != nil {
			return err
		}
		if len(languages) == 0 {
			return nil
		}
		rows := make([]models.UserLanguage, 0, len(languages))
		for i, l := range languages {
			rows = append(rows, models.UserLanguage{
				ID: uuid.New(), UserID: userID, Language: l, Position: i,
			})
		}
		return tx.Create(&rows).Error
	})
}

// Service holds profile business logic.
type Service struct {
	repo  *Repository
	cache cache.Cache
}

// NewService builds a Service. cache may be nil.
func NewService(repo *Repository, c cache.Cache) *Service {
	return &Service{repo: repo, cache: c}
}

// Get returns a user's public profile.
func (s *Service) Get(ctx context.Context, id uuid.UUID) (*PublicProfile, error) {
	u, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("user_not_found", "user not found")
		}
		return nil, httperr.Internal("could not load profile").Wrap(err)
	}
	langs, err := s.repo.LanguagesFor(ctx, id)
	if err != nil {
		return nil, httperr.Internal("could not load languages").Wrap(err)
	}
	p := toPublicProfile(u, langs)
	return &p, nil
}

// Update validates and persists the caller's own profile, returning the result.
func (s *Service) Update(ctx context.Context, userID uuid.UUID, req UpdateRequest) (*PublicProfile, error) {
	display := strings.TrimSpace(req.DisplayName)
	if n := len([]rune(display)); n < 1 || n > 50 {
		return nil, httperr.BadRequest("invalid_profile", "display name must be 1-50 characters")
	}
	bio := strings.TrimSpace(req.Bio)
	if len([]rune(bio)) > 160 {
		return nil, httperr.BadRequest("invalid_profile", "bio must be at most 160 characters")
	}

	x := stripAt(req.XHandle)
	if x != "" && !xHandlePattern.MatchString(x) {
		return nil, httperr.BadRequest("invalid_profile", "invalid X handle")
	}
	gh := stripAt(req.GithubHandle)
	if gh != "" && !githubHandlePattern.MatchString(gh) {
		return nil, httperr.BadRequest("invalid_profile", "invalid GitHub handle")
	}
	zenn := stripAt(req.ZennHandle)
	if zenn != "" && !zennHandlePattern.MatchString(zenn) {
		return nil, httperr.BadRequest("invalid_profile", "invalid Zenn handle")
	}

	linkedin := strings.TrimSpace(req.LinkedinURL)
	if linkedin != "" && !validURL(linkedin) {
		return nil, httperr.BadRequest("invalid_profile", "LinkedIn must be a valid http(s) URL")
	}
	portfolio := strings.TrimSpace(req.PortfolioURL)
	if portfolio != "" && !validURL(portfolio) {
		return nil, httperr.BadRequest("invalid_profile", "portfolio must be a valid http(s) URL")
	}

	languages, err := normaliseLanguages(req.Languages)
	if err != nil {
		return nil, err
	}

	fields := map[string]any{
		"display_name":  display,
		"bio":           bio,
		"x_handle":      x,
		"github_handle": gh,
		"zenn_handle":   zenn,
		"linkedin_url":  linkedin,
		"portfolio_url": portfolio,
	}
	if err := s.repo.UpdateProfile(ctx, userID, fields); err != nil {
		return nil, httperr.Internal("could not update profile").Wrap(err)
	}
	if err := s.repo.ReplaceLanguages(ctx, userID, languages); err != nil {
		return nil, httperr.Internal("could not update languages").Wrap(err)
	}
	// The display name appears in the global graph; drop its cache so the
	// change shows up immediately rather than after the TTL.
	if s.cache != nil {
		_ = s.cache.Delete(ctx, network.GlobalCacheKey)
	}
	return s.Get(ctx, userID)
}

func stripAt(s string) string {
	return strings.TrimPrefix(strings.TrimSpace(s), "@")
}

// normaliseLanguages trims, validates, de-duplicates (case-insensitively) and
// caps the language list while preserving the caller's ordering.
func normaliseLanguages(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		l := strings.TrimSpace(raw)
		if l == "" {
			continue
		}
		if !languagePattern.MatchString(l) {
			return nil, httperr.BadRequest("invalid_profile", "invalid language: "+l)
		}
		key := strings.ToLower(l)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, l)
	}
	if len(out) > maxLanguages {
		return nil, httperr.BadRequest("invalid_profile", "too many languages (max 30)")
	}
	return out, nil
}

func validURL(raw string) bool {
	if len(raw) > 300 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// Handler exposes the profile endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the profile routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/users/:id", h.Get, authmw)
	g.PUT("/me/profile", h.Update, authmw)
}

// Get handles GET /users/:id.
func (h *Handler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid user id")
	}
	p, err := h.svc.Get(c.Request().Context(), id)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, p)
}

// Update handles PUT /me/profile.
func (h *Handler) Update(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req UpdateRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	p, err := h.svc.Update(c.Request().Context(), userID, req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, p)
}
