// Package user holds user discovery endpoints (search) used to find people to
// send friend requests to. Profile retrieval lives in the auth slice (/me).
package user

import (
	"context"
	"net/http"
	"strconv"
	"strings"

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
	ID          uuid.UUID `json:"id"`
	Username    string    `json:"username"`
	DisplayName string    `json:"display_name"`
}

// Repository searches the users table.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Search returns users whose username or display name matches the query,
// excluding the caller. The query is escaped for safe LIKE matching.
func (r *Repository) Search(ctx context.Context, q string, exclude uuid.UUID, limit int) ([]models.User, error) {
	pattern := "%" + escapeLike(q) + "%"
	var users []models.User
	err := r.db.WithContext(ctx).
		Where("id <> ?", exclude).
		Where("username ILIKE ? ESCAPE '\\' OR display_name ILIKE ? ESCAPE '\\'", pattern, pattern).
		Order("username ASC").
		Limit(limit).
		Find(&users).Error
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
	if len([]rune(q)) < minQueryLen {
		return httperr.BadRequest("query_too_short", "search query must be at least 2 characters")
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

	users, err := h.repo.Search(c.Request().Context(), q, userID, limit)
	if err != nil {
		return httperr.Internal("could not search users").Wrap(err)
	}

	results := make([]Result, 0, len(users))
	for i := range users {
		results = append(results, Result{
			ID:          users[i].ID,
			Username:    users[i].Username,
			DisplayName: users[i].DisplayName,
		})
	}
	return c.JSON(http.StatusOK, echo.Map{"results": results})
}

// escapeLike escapes LIKE wildcards so user input is treated literally.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}
