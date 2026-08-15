// Package beacon implements the ephemeral "ok to talk to me about this now"
// signal. A user has at most one active beacon; it expires after a fixed window
// so the network only ever shows live signals. Friends see each other's beacons
// and respond with a Connection Card rather than a comment.
package beacon

import (
	"context"
	"net/http"
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

const (
	ttl        = 72 * time.Hour
	maxMessage = 140
)

// UserSummary is the compact, public view of a beacon's owner.
type UserSummary struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
}

// Beacon is an active signal. User is populated for friends' beacons and omitted
// for the caller's own.
type Beacon struct {
	User      *UserSummary `json:"user,omitempty"`
	Message   string       `json:"message"`
	ExpiresAt time.Time    `json:"expires_at"`
}

// SetRequest is the body for raising a beacon.
type SetRequest struct {
	Message string `json:"message"`
}

// friendBeaconRow is the flat join result for a friend's active beacon.
type friendBeaconRow struct {
	UserID          uuid.UUID
	Username        string
	DisplayName     string
	AvatarUpdatedAt *time.Time
	Message         string
	ExpiresAt       time.Time
}

// Repository is the beacon slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Upsert raises (or replaces) the user's beacon.
func (r *Repository) Upsert(ctx context.Context, b *models.Beacon) error {
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"message", "created_at", "expires_at"}),
		}).
		Create(b).Error
}

// GetActive returns the user's beacon if it hasn't expired.
func (r *Repository) GetActive(ctx context.Context, userID uuid.UUID, now time.Time) (*models.Beacon, error) {
	var b models.Beacon
	err := r.db.WithContext(ctx).
		Where("user_id = ? AND expires_at > ?", userID, now).
		First(&b).Error
	if err != nil {
		return nil, err
	}
	return &b, nil
}

// Delete clears the user's beacon.
func (r *Repository) Delete(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Where("user_id = ?", userID).Delete(&models.Beacon{}).Error
}

// ListFriendsActive returns the active beacons of the user's accepted friends.
func (r *Repository) ListFriendsActive(ctx context.Context, userID uuid.UUID, now time.Time) ([]friendBeaconRow, error) {
	var rows []friendBeaconRow
	err := r.db.WithContext(ctx).
		Table("beacons b").
		Select("b.user_id, u.username, u.display_name, u.avatar_updated_at, b.message, b.expires_at").
		Joins("JOIN users u ON u.id = b.user_id").
		Where(`b.expires_at > ? AND b.user_id IN (
		    SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
		    FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
		)`, now, userID, userID, userID).
		Order("b.created_at DESC").
		Scan(&rows).Error
	return rows, err
}

// Service holds beacon business logic.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Set raises the caller's beacon for the fixed window.
func (s *Service) Set(ctx context.Context, userID uuid.UUID, req SetRequest) (*Beacon, error) {
	msg := strings.TrimSpace(req.Message)
	if msg == "" {
		return nil, httperr.BadRequest("invalid_beacon", "message is required")
	}
	if len([]rune(msg)) > maxMessage {
		return nil, httperr.BadRequest("invalid_beacon", "message must be at most 140 characters")
	}
	now := time.Now().UTC()
	b := &models.Beacon{
		ID:        uuid.New(),
		UserID:    userID,
		Message:   msg,
		CreatedAt: now,
		ExpiresAt: now.Add(ttl),
	}
	if err := s.repo.Upsert(ctx, b); err != nil {
		return nil, httperr.Internal("could not set beacon").Wrap(err)
	}
	return &Beacon{Message: b.Message, ExpiresAt: b.ExpiresAt}, nil
}

// Mine returns the caller's active beacon, or nil.
func (s *Service) Mine(ctx context.Context, userID uuid.UUID) (*Beacon, error) {
	b, err := s.repo.GetActive(ctx, userID, time.Now().UTC())
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil
		}
		return nil, httperr.Internal("could not load beacon").Wrap(err)
	}
	return &Beacon{Message: b.Message, ExpiresAt: b.ExpiresAt}, nil
}

// Clear lowers the caller's beacon.
func (s *Service) Clear(ctx context.Context, userID uuid.UUID) error {
	if err := s.repo.Delete(ctx, userID); err != nil {
		return httperr.Internal("could not clear beacon").Wrap(err)
	}
	return nil
}

// Friends returns the active beacons of the caller's friends.
func (s *Service) Friends(ctx context.Context, userID uuid.UUID) ([]Beacon, error) {
	rows, err := s.repo.ListFriendsActive(ctx, userID, time.Now().UTC())
	if err != nil {
		return nil, httperr.Internal("could not load beacons").Wrap(err)
	}
	out := make([]Beacon, 0, len(rows))
	for i := range rows {
		r := &rows[i]
		out = append(out, Beacon{
			User: &UserSummary{
				ID:              r.UserID,
				Username:        r.Username,
				DisplayName:     r.DisplayName,
				AvatarUpdatedAt: r.AvatarUpdatedAt,
			},
			Message:   r.Message,
			ExpiresAt: r.ExpiresAt,
		})
	}
	return out, nil
}

// Handler exposes the beacon endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the beacon routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/beacons", h.Friends, authmw)
	g.GET("/beacons/me", h.Mine, authmw)
	g.PUT("/beacons/me", h.Set, authmw)
	g.DELETE("/beacons/me", h.Clear, authmw)
}

// Set handles PUT /beacons/me.
func (h *Handler) Set(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req SetRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	b, err := h.svc.Set(c.Request().Context(), userID, req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, b)
}

// Mine handles GET /beacons/me.
func (h *Handler) Mine(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	b, err := h.svc.Mine(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"beacon": b})
}

// Clear handles DELETE /beacons/me.
func (h *Handler) Clear(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	if err := h.svc.Clear(c.Request().Context(), userID); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Friends handles GET /beacons.
func (h *Handler) Friends(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.Friends(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"beacons": list})
}
