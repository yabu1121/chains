// Package events is a minimal first-party analytics sink. The client posts named
// product events (onboarding_completed, qr_shared, note_saved, followup_set,
// followup_completed, article_saved, …) which are stored for computing launch
// KPIs and D1/D7/D30 retention from our own database — no third-party tracker.
package events

import (
	"context"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

// namePattern constrains event names to a small, safe identifier shape.
var namePattern = regexp.MustCompile(`^[a-z][a-z0-9_]{1,63}$`)

const maxPropsBytes = 2048

// IngestRequest is the body for recording an event.
type IngestRequest struct {
	Name  string         `json:"name"`
	Props map[string]any `json:"props"`
}

// Repository is the events slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Insert stores an event.
func (r *Repository) Insert(ctx context.Context, e *models.AnalyticsEvent) error {
	return r.db.WithContext(ctx).Create(e).Error
}

// Service holds event business logic.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Track validates and records an event for the user.
func (s *Service) Track(ctx context.Context, userID uuid.UUID, req IngestRequest) error {
	name := strings.TrimSpace(req.Name)
	if !namePattern.MatchString(name) {
		return httperr.BadRequest("invalid_event", "invalid event name")
	}
	props := "{}"
	if req.Props != nil {
		raw, err := json.Marshal(req.Props)
		if err != nil {
			return httperr.BadRequest("invalid_event", "props must be a JSON object")
		}
		if len(raw) > maxPropsBytes {
			return httperr.BadRequest("invalid_event", "props too large")
		}
		props = string(raw)
	}
	uid := userID
	e := &models.AnalyticsEvent{
		ID:     uuid.New(),
		UserID: &uid,
		Name:   name,
		Props:  props,
	}
	if err := s.repo.Insert(ctx, e); err != nil {
		return httperr.Internal("could not record event").Wrap(err)
	}
	return nil
}

// Handler exposes the events endpoint.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the events route behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.POST("/events", h.Track, authmw)
}

// Track handles POST /events.
func (h *Handler) Track(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req IngestRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := h.svc.Track(c.Request().Context(), userID, req); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
