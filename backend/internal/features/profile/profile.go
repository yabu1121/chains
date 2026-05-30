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
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/features/network"
	"github.com/cymed/chains/backend/internal/langs"
	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

var (
	xHandlePattern      = regexp.MustCompile(`^[A-Za-z0-9_]{1,15}$`)
	githubHandlePattern = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)
	zennHandlePattern   = regexp.MustCompile(`^[A-Za-z0-9_]{1,30}$`)
)

const maxLanguages = 30

// PublicProfile is the publicly visible profile (no email). Age and BirthDate
// are gated by the owner's visibility toggles (and always shown to the owner so
// the editor can prefill). ShowAge/ShowBirthDate are only populated for the
// owner.
type PublicProfile struct {
	ID            uuid.UUID `json:"id"`
	Username      string    `json:"username"`
	DisplayName   string    `json:"display_name"`
	JobTitle      string    `json:"job_title"`
	StatusMessage string    `json:"status_message"`
	XHandle       string    `json:"x_handle"`
	GithubHandle  string    `json:"github_handle"`
	ZennHandle    string    `json:"zenn_handle"`
	LinkedinURL   string    `json:"linkedin_url"`
	PortfolioURL  string    `json:"portfolio_url"`
	Languages     []string  `json:"languages"`

	// LinksVisible is true when the viewer may see the account links above
	// (self or an accepted friend). When false, those fields are blanked.
	LinksVisible bool `json:"links_visible"`

	Age           *int    `json:"age"`
	BirthDate     *string `json:"birth_date"`
	ShowAge       *bool   `json:"show_age"`
	ShowBirthDate *bool   `json:"show_birth_date"`

	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
	CreatedAt       time.Time  `json:"created_at"`
}

// UpdateRequest is the body for editing one's own profile. BirthDate is
// "YYYY-MM-DD" or empty to clear.
type UpdateRequest struct {
	DisplayName   string   `json:"display_name"`
	JobTitle      string   `json:"job_title"`
	StatusMessage string   `json:"status_message"`
	XHandle       string   `json:"x_handle"`
	GithubHandle  string   `json:"github_handle"`
	ZennHandle    string   `json:"zenn_handle"`
	LinkedinURL   string   `json:"linkedin_url"`
	PortfolioURL  string   `json:"portfolio_url"`
	Languages     []string `json:"languages"`
	BirthDate     string   `json:"birth_date"`
	ShowAge       bool     `json:"show_age"`
	ShowBirthDate bool     `json:"show_birth_date"`
}

// ageFrom returns the whole-year age at now for someone born on bd.
func ageFrom(bd, now time.Time) int {
	age := now.Year() - bd.Year()
	if now.Month() < bd.Month() || (now.Month() == bd.Month() && now.Day() < bd.Day()) {
		age--
	}
	return age
}

// toPublicProfile builds the viewer-facing profile. Account links (X, GitHub,
// Zenn, LinkedIn, portfolio) are only included when showLinks is true — i.e.
// the viewer is the owner or an accepted friend; otherwise they are blanked.
func toPublicProfile(u *models.User, languages []string, viewerID uuid.UUID, now time.Time, showLinks bool) PublicProfile {
	if languages == nil {
		languages = []string{}
	}
	p := PublicProfile{
		ID:              u.ID,
		Username:        u.Username,
		DisplayName:     u.DisplayName,
		JobTitle:        u.JobTitle,
		StatusMessage:   u.StatusMessage,
		Languages:       languages,
		LinksVisible:    showLinks,
		AvatarUpdatedAt: u.AvatarUpdatedAt,
		CreatedAt:       u.CreatedAt,
	}
	if showLinks {
		p.XHandle = u.XHandle
		p.GithubHandle = u.GithubHandle
		p.ZennHandle = u.ZennHandle
		p.LinkedinURL = u.LinkedinURL
		p.PortfolioURL = u.PortfolioURL
	}

	isSelf := u.ID == viewerID
	if u.BirthDate != nil {
		if isSelf || u.ShowAge {
			a := ageFrom(*u.BirthDate, now)
			p.Age = &a
		}
		if isSelf || u.ShowBirthDate {
			d := u.BirthDate.Format("2006-01-02")
			p.BirthDate = &d
		}
	}
	if isSelf {
		sa, sb := u.ShowAge, u.ShowBirthDate
		p.ShowAge = &sa
		p.ShowBirthDate = &sb
	}
	return p
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

// GetByUsername loads a user by username (case-insensitive), or returns
// gorm.ErrRecordNotFound.
func (r *Repository) GetByUsername(ctx context.Context, username string) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).First(&u, "lower(username) = lower(?)", username).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// AreFriends reports whether a and b have an accepted friendship (either
// direction).
func (r *Repository) AreFriends(ctx context.Context, a, b uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Friendship{}).
		Where("status = ? AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))",
			models.FriendshipAccepted, a, b, b, a).
		Count(&count).Error
	return count > 0, err
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

// Get returns a user's public profile as seen by viewerID. The owner sees their
// own age/birth date and visibility flags regardless of the toggles.
func (s *Service) Get(ctx context.Context, id, viewerID uuid.UUID) (*PublicProfile, error) {
	u, err := s.repo.GetByID(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("user_not_found", "user not found")
		}
		return nil, httperr.Internal("could not load profile").Wrap(err)
	}
	return s.build(ctx, u, viewerID)
}

// GetByUsername returns a user's public profile by username (used by the
// QR/add-by-username flow), as seen by viewerID.
func (s *Service) GetByUsername(ctx context.Context, username string, viewerID uuid.UUID) (*PublicProfile, error) {
	u, err := s.repo.GetByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("user_not_found", "user not found")
		}
		return nil, httperr.Internal("could not load profile").Wrap(err)
	}
	return s.build(ctx, u, viewerID)
}

// build assembles a PublicProfile for the given user as seen by viewerID,
// loading languages and gating account links to self/friends.
func (s *Service) build(ctx context.Context, u *models.User, viewerID uuid.UUID) (*PublicProfile, error) {
	langs, err := s.repo.LanguagesFor(ctx, u.ID)
	if err != nil {
		return nil, httperr.Internal("could not load languages").Wrap(err)
	}
	showLinks := u.ID == viewerID
	if !showLinks {
		showLinks, err = s.repo.AreFriends(ctx, u.ID, viewerID)
		if err != nil {
			return nil, httperr.Internal("could not check friendship").Wrap(err)
		}
	}
	p := toPublicProfile(u, langs, viewerID, time.Now().UTC(), showLinks)
	return &p, nil
}

// Update validates and persists the caller's own profile, returning the result.
func (s *Service) Update(ctx context.Context, userID uuid.UUID, req UpdateRequest) (*PublicProfile, error) {
	display := strings.TrimSpace(req.DisplayName)
	if n := len([]rune(display)); n < 1 || n > 50 {
		return nil, httperr.BadRequest("invalid_profile", "display name must be 1-50 characters")
	}
	jobTitle := strings.TrimSpace(req.JobTitle)
	if len([]rune(jobTitle)) > 60 {
		return nil, httperr.BadRequest("invalid_profile", "job title must be at most 60 characters")
	}
	statusMessage := strings.TrimSpace(req.StatusMessage)
	if len([]rune(statusMessage)) > 100 {
		return nil, httperr.BadRequest("invalid_profile", "status message must be at most 100 characters")
	}

	birthDate, err := parseBirthDate(req.BirthDate)
	if err != nil {
		return nil, err
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
		"display_name":    display,
		"job_title":       jobTitle,
		"status_message":  statusMessage,
		"x_handle":        x,
		"github_handle":   gh,
		"zenn_handle":     zenn,
		"linkedin_url":    linkedin,
		"portfolio_url":   portfolio,
		"birth_date":      birthDate, // *time.Time; nil clears the column
		"show_age":        req.ShowAge,
		"show_birth_date": req.ShowBirthDate,
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
	return s.Get(ctx, userID, userID)
}

// parseBirthDate parses "YYYY-MM-DD" (empty clears it), rejecting future dates
// and implausibly old ones.
func parseBirthDate(raw string) (*time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, nil
	}
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil, httperr.BadRequest("invalid_profile", "birth date must be YYYY-MM-DD")
	}
	now := time.Now().UTC()
	if d.After(now) {
		return nil, httperr.BadRequest("invalid_profile", "birth date cannot be in the future")
	}
	if d.Year() < now.Year()-150 {
		return nil, httperr.BadRequest("invalid_profile", "birth date is not valid")
	}
	return &d, nil
}

func stripAt(s string) string {
	return strings.TrimPrefix(strings.TrimSpace(s), "@")
}

// normaliseLanguages validates each entry against the canonical language list,
// stores its canonical form (e.g. "go" -> "Go"), de-duplicates and caps the
// list while preserving the caller's ordering.
func normaliseLanguages(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		if strings.TrimSpace(raw) == "" {
			continue
		}
		canonical, ok := langs.Canonical(raw)
		if !ok {
			return nil, httperr.BadRequest("invalid_profile", "unknown language: "+raw)
		}
		key := strings.ToLower(canonical)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, canonical)
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
	g.GET("/users/by-username/:username", h.GetByUsername, authmw)
	g.GET("/users/:id", h.Get, authmw)
	g.PUT("/me/profile", h.Update, authmw)
}

// Get handles GET /users/:id.
func (h *Handler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid user id")
	}
	viewerID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	p, err := h.svc.Get(c.Request().Context(), id, viewerID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, p)
}

// GetByUsername handles GET /users/by-username/:username.
func (h *Handler) GetByUsername(c echo.Context) error {
	username := strings.TrimSpace(c.Param("username"))
	if username == "" {
		return httperr.BadRequest("invalid_username", "invalid username")
	}
	viewerID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	p, err := h.svc.GetByUsername(c.Request().Context(), username, viewerID)
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
