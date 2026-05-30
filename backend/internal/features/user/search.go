// Package user holds user discovery endpoints (search) used to find people to
// send friend requests to. Profile retrieval lives in the auth slice (/me).
package user

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

const (
	defaultLimit = 20
	maxLimit     = 50
	minQueryLen  = 2
)

// Result is one public search hit (handle and display name, never email).
type Result struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
}

// Repository searches the users table.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Search returns users matching the given filters, excluding the caller. A
// non-empty q matches username or display name (escaped for safe LIKE); a
// non-empty lang restricts to users who list that programming language. At
// least one filter is expected; both may be combined.
func (r *Repository) Search(ctx context.Context, q, lang string, exclude uuid.UUID, limit int) ([]models.User, error) {
	tx := r.db.WithContext(ctx).
		Model(&models.User{}).
		Where("id <> ?", exclude)
	if q != "" {
		pattern := "%" + escapeLike(q) + "%"
		tx = tx.Where("username ILIKE ? ESCAPE '\\' OR display_name ILIKE ? ESCAPE '\\'", pattern, pattern)
	}
	if lang != "" {
		tx = tx.Where(
			"id IN (SELECT user_id FROM user_languages WHERE lower(language) = lower(?))",
			lang,
		)
	}
	var users []models.User
	err := tx.Order("username ASC").Limit(limit).Find(&users).Error
	return users, err
}

// Handler exposes user search.
type Handler struct {
	repo *Repository
}

// NewHandler builds a Handler.
func NewHandler(repo *Repository) *Handler {
	return &Handler{repo: repo}
}

// RegisterRoutes mounts the user routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/users/search", h.Search, authmw)
}

// Search handles GET /users/search?q=&limit=.
func (h *Handler) Search(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}

	q := strings.TrimSpace(c.QueryParam("q"))
	lang := strings.TrimSpace(c.QueryParam("lang"))

	// A text query, when given, must be at least minQueryLen. Searching by
	// language alone is allowed, but at least one filter is required.
	if q != "" && len([]rune(q)) < minQueryLen {
		return httperr.BadRequest("query_too_short", "search query must be at least 2 characters")
	}
	if q == "" && lang == "" {
		return httperr.BadRequest("query_required", "provide a search query or a language filter")
	}

	limit := defaultLimit
	if raw := c.QueryParam("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	users, err := h.repo.Search(c.Request().Context(), q, lang, userID, limit)
	if err != nil {
		return httperr.Internal("could not search users").Wrap(err)
	}

	results := make([]Result, 0, len(users))
	for i := range users {
		results = append(results, Result{
			ID:              users[i].ID,
			Username:        users[i].Username,
			DisplayName:     users[i].DisplayName,
			AvatarUpdatedAt: users[i].AvatarUpdatedAt,
		})
	}
	return c.JSON(http.StatusOK, echo.Map{"results": results})
}

// escapeLike escapes LIKE wildcards so user input is treated literally.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}
