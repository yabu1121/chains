// Package saved is the user's personal reading list built from the News feed. It
// is the core retention mechanic: people come back to read what they saved, and
// every save is interest signal that sharpens future recommendations. Articles
// move through unread → read, or are hidden so the feed never resurfaces them.
package saved

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

const maxField = 500

// Article is a saved article as returned to its owner.
type Article struct {
	ID          uuid.UUID  `json:"id"`
	URL         string     `json:"url"`
	Title       string     `json:"title"`
	Source      string     `json:"source,omitempty"`
	Author      string     `json:"author,omitempty"`
	Summary     string     `json:"summary,omitempty"`
	Language    string     `json:"language,omitempty"`
	PublishedAt *time.Time `json:"published_at"`
	Status      string     `json:"status"`
	SavedAt     time.Time  `json:"saved_at"`
}

// SaveRequest is the body for saving (or hiding) an article. Status is optional
// and defaults to "unread"; only "unread" or "hidden" are accepted here (an
// article becomes "read" via the update endpoint).
type SaveRequest struct {
	URL         string     `json:"url"`
	Title       string     `json:"title"`
	Source      string     `json:"source"`
	Author      string     `json:"author"`
	Summary     string     `json:"summary"`
	Language    string     `json:"language"`
	PublishedAt *time.Time `json:"published_at"`
	Status      string     `json:"status"`
}

// UpdateRequest is the body for changing a saved article's status.
type UpdateRequest struct {
	Status string `json:"status"`
}

// Repository is the saved slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Upsert saves an article for a user, updating the existing row (status +
// metadata) if one already exists for the same URL.
func (r *Repository) Upsert(ctx context.Context, a *models.SavedArticle) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "user_id"}, {Name: "url"}},
			DoUpdates: clause.AssignmentColumns([]string{
				"title", "source", "author", "summary", "language",
				"published_at", "status", "updated_at",
			}),
		}).
		Create(a).Error
}

// Get loads a saved article owned by the user, or gorm.ErrRecordNotFound.
func (r *Repository) Get(ctx context.Context, userID, id uuid.UUID) (*models.SavedArticle, error) {
	var a models.SavedArticle
	if err := r.db.WithContext(ctx).
		First(&a, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

// List returns a user's saved articles with any of the given statuses, newest
// first.
func (r *Repository) List(ctx context.Context, userID uuid.UUID, statuses []string) ([]models.SavedArticle, error) {
	var rows []models.SavedArticle
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND status IN ?", userID, statuses).
		Order("updated_at DESC").
		Find(&rows).Error
	return rows, err
}

// SetStatus updates a saved article's status, returning rows affected.
func (r *Repository) SetStatus(ctx context.Context, userID, id uuid.UUID, status models.SavedArticleStatus, at time.Time) (int64, error) {
	res := r.db.WithContext(ctx).
		Model(&models.SavedArticle{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(map[string]any{"status": status, "updated_at": at})
	return res.RowsAffected, res.Error
}

// Delete removes a saved article, returning rows affected.
func (r *Repository) Delete(ctx context.Context, userID, id uuid.UUID) (int64, error) {
	res := r.db.WithContext(ctx).
		Where("id = ? AND user_id = ?", id, userID).
		Delete(&models.SavedArticle{})
	return res.RowsAffected, res.Error
}

// Service holds saved-article business logic.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Save validates and stores an article on the caller's list.
func (s *Service) Save(ctx context.Context, userID uuid.UUID, req SaveRequest) (*Article, error) {
	link := strings.TrimSpace(req.URL)
	if !validURL(link) {
		return nil, httperr.BadRequest("invalid_article", "a valid http(s) url is required")
	}
	title := strings.TrimSpace(req.Title)
	if title == "" || len([]rune(title)) > maxField {
		return nil, httperr.BadRequest("invalid_article", "title is required")
	}

	status := models.SavedUnread
	if req.Status != "" {
		st := models.SavedArticleStatus(req.Status)
		// Saving only ever produces an unread or hidden row; "read" is reached via
		// the update endpoint.
		if st != models.SavedUnread && st != models.SavedHidden {
			return nil, httperr.BadRequest("invalid_status", "status must be unread or hidden")
		}
		status = st
	}

	a := &models.SavedArticle{
		ID:          uuid.New(),
		UserID:      userID,
		URL:         link,
		Title:       title,
		Source:      clip(req.Source),
		Author:      clip(req.Author),
		Summary:     clip(req.Summary),
		Language:    clip(req.Language),
		PublishedAt: req.PublishedAt,
		Status:      status,
	}
	if err := s.repo.Upsert(ctx, a); err != nil {
		return nil, httperr.Internal("could not save article").Wrap(err)
	}
	// Re-read so the response reflects the stored row (including a kept created_at
	// when the article was already saved).
	stored, err := s.repo.Get(ctx, userID, a.ID)
	if err != nil {
		// The row exists (we just upserted); a not-found here means it was the
		// pre-existing row under a different id — return what we built instead.
		return toArticle(a), nil
	}
	return toArticle(stored), nil
}

// List returns the caller's saved articles. An empty status returns the reading
// list (unread + read); "hidden" can be requested explicitly.
func (s *Service) List(ctx context.Context, userID uuid.UUID, status string) ([]Article, error) {
	var statuses []string
	switch status {
	case "":
		statuses = []string{string(models.SavedUnread), string(models.SavedRead)}
	case "all":
		// Everything, including hidden — used by the feed to mark/filter articles.
		statuses = []string{string(models.SavedUnread), string(models.SavedRead), string(models.SavedHidden)}
	case string(models.SavedUnread), string(models.SavedRead), string(models.SavedHidden):
		statuses = []string{status}
	default:
		return nil, httperr.BadRequest("invalid_status", "unknown status")
	}
	rows, err := s.repo.List(ctx, userID, statuses)
	if err != nil {
		return nil, httperr.Internal("could not load saved articles").Wrap(err)
	}
	out := make([]Article, 0, len(rows))
	for i := range rows {
		out = append(out, *toArticle(&rows[i]))
	}
	return out, nil
}

// SetStatus updates a saved article's status (unread / read / hidden).
func (s *Service) SetStatus(ctx context.Context, userID, id uuid.UUID, status string) error {
	st := models.SavedArticleStatus(status)
	if !st.Valid() {
		return httperr.BadRequest("invalid_status", "status must be unread, read or hidden")
	}
	n, err := s.repo.SetStatus(ctx, userID, id, st, time.Now())
	if err != nil {
		return httperr.Internal("could not update article").Wrap(err)
	}
	if n == 0 {
		return httperr.NotFound("article_not_found", "saved article not found")
	}
	return nil
}

// Remove deletes a saved article.
func (s *Service) Remove(ctx context.Context, userID, id uuid.UUID) error {
	n, err := s.repo.Delete(ctx, userID, id)
	if err != nil {
		return httperr.Internal("could not delete article").Wrap(err)
	}
	if n == 0 {
		return httperr.NotFound("article_not_found", "saved article not found")
	}
	return nil
}

func toArticle(a *models.SavedArticle) *Article {
	return &Article{
		ID:          a.ID,
		URL:         a.URL,
		Title:       a.Title,
		Source:      a.Source,
		Author:      a.Author,
		Summary:     a.Summary,
		Language:    a.Language,
		PublishedAt: a.PublishedAt,
		Status:      string(a.Status),
		SavedAt:     a.CreatedAt,
	}
}

func clip(s string) string {
	s = strings.TrimSpace(s)
	if len([]rune(s)) > maxField {
		s = string([]rune(s)[:maxField])
	}
	return s
}

func validURL(raw string) bool {
	if raw == "" || len(raw) > 600 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// Handler exposes the saved-article endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the saved routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.POST("/saved", h.Save, authmw)
	g.GET("/saved", h.List, authmw)
	g.PATCH("/saved/:id", h.Update, authmw)
	g.DELETE("/saved/:id", h.Delete, authmw)
}

// Save handles POST /saved.
func (h *Handler) Save(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req SaveRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	a, err := h.svc.Save(c.Request().Context(), userID, req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, a)
}

// List handles GET /saved?status=.
func (h *Handler) List(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.List(c.Request().Context(), userID, strings.TrimSpace(c.QueryParam("status")))
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"articles": list})
}

// Update handles PATCH /saved/:id.
func (h *Handler) Update(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid id")
	}
	var req UpdateRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := h.svc.SetStatus(c.Request().Context(), userID, id, req.Status); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /saved/:id.
func (h *Handler) Delete(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid id")
	}
	if err := h.svc.Remove(c.Request().Context(), userID, id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
