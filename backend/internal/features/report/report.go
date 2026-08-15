// Package report lets a user flag another for review (spam, harassment,
// impersonation, …). It is a safety baseline for launch; reports are stored for
// out-of-band review rather than acted on automatically.
package report

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

const maxDetails = 1000

// validStatuses is the set of moderation statuses an admin can set.
var validStatuses = map[string]struct{}{
	"open":      {},
	"reviewed":  {},
	"actioned":  {},
	"dismissed": {},
}

// AdminReport is a report as seen in the moderation queue (with both parties'
// handles).
type AdminReport struct {
	ID               uuid.UUID `json:"id"`
	ReporterUsername string    `json:"reporter_username"`
	ReportedID       uuid.UUID `json:"reported_id"`
	ReportedUsername string    `json:"reported_username"`
	Reason           string    `json:"reason"`
	Details          string    `json:"details"`
	Status           string    `json:"status"`
	CreatedAt        time.Time `json:"created_at"`
}

// StatusRequest is the body for updating a report's moderation status.
type StatusRequest struct {
	Status string `json:"status"`
}

// validReasons is the accepted set of report reasons.
var validReasons = map[string]struct{}{
	"spam":          {},
	"harassment":    {},
	"impersonation": {},
	"inappropriate": {},
	"other":         {},
}

// CreateRequest is the body for filing a report.
type CreateRequest struct {
	ReportedID uuid.UUID `json:"reported_id"`
	Reason     string    `json:"reason"`
	Details    string    `json:"details"`
}

// Repository is the report slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// UserExists reports whether a user row exists.
func (r *Repository) UserExists(ctx context.Context, id uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", id).Count(&count).Error
	return count > 0, err
}

// Create inserts a report.
func (r *Repository) Create(ctx context.Context, rep *models.Report) error {
	return r.db.WithContext(ctx).Create(rep).Error
}

// IsAdmin reports whether the user has the admin flag.
func (r *Repository) IsAdmin(ctx context.Context, id uuid.UUID) (bool, error) {
	var admin bool
	err := r.db.WithContext(ctx).
		Model(&models.User{}).
		Select("is_admin").
		Where("id = ?", id).
		Scan(&admin).Error
	return admin, err
}

// List returns reports for the moderation queue, joined with both parties'
// handles, newest first.
func (r *Repository) List(ctx context.Context) ([]AdminReport, error) {
	var rows []AdminReport
	err := r.db.WithContext(ctx).
		Table("reports rp").
		Select("rp.id, ur.username AS reporter_username, rp.reported_id, ud.username AS reported_username, rp.reason, rp.details, rp.status, rp.created_at").
		Joins("JOIN users ur ON ur.id = rp.reporter_id").
		Joins("JOIN users ud ON ud.id = rp.reported_id").
		Order("rp.created_at DESC").
		Limit(500).
		Scan(&rows).Error
	return rows, err
}

// SetStatus updates a report's moderation status, returning rows affected.
func (r *Repository) SetStatus(ctx context.Context, id uuid.UUID, status string) (int64, error) {
	res := r.db.WithContext(ctx).
		Model(&models.Report{}).
		Where("id = ?", id).
		Update("status", status)
	return res.RowsAffected, res.Error
}

// Service holds report business logic.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and stores a report from reporter against the target.
func (s *Service) Create(ctx context.Context, reporterID uuid.UUID, req CreateRequest) error {
	if req.ReportedID == uuid.Nil || req.ReportedID == reporterID {
		return httperr.BadRequest("invalid_report", "you cannot report this user")
	}
	reason := strings.TrimSpace(req.Reason)
	if _, ok := validReasons[reason]; !ok {
		return httperr.BadRequest("invalid_report", "unknown report reason")
	}
	details := strings.TrimSpace(req.Details)
	if len([]rune(details)) > maxDetails {
		return httperr.BadRequest("invalid_report", "details must be at most 1000 characters")
	}
	exists, err := s.repo.UserExists(ctx, req.ReportedID)
	if err != nil {
		return httperr.Internal("could not verify user").Wrap(err)
	}
	if !exists {
		return httperr.NotFound("user_not_found", "user not found")
	}
	rep := &models.Report{
		ID:         uuid.New(),
		ReporterID: reporterID,
		ReportedID: req.ReportedID,
		Reason:     reason,
		Details:    details,
	}
	if err := s.repo.Create(ctx, rep); err != nil {
		return httperr.Internal("could not file report").Wrap(err)
	}
	return nil
}

// requireAdmin returns nil if the user is an admin, else a 403.
func (s *Service) requireAdmin(ctx context.Context, userID uuid.UUID) error {
	admin, err := s.repo.IsAdmin(ctx, userID)
	if err != nil {
		return httperr.Internal("could not verify admin").Wrap(err)
	}
	if !admin {
		return httperr.Forbidden("not_admin", "admin only")
	}
	return nil
}

// ListQueue returns the moderation queue (admin only).
func (s *Service) ListQueue(ctx context.Context, userID uuid.UUID) ([]AdminReport, error) {
	if err := s.requireAdmin(ctx, userID); err != nil {
		return nil, err
	}
	rows, err := s.repo.List(ctx)
	if err != nil {
		return nil, httperr.Internal("could not load reports").Wrap(err)
	}
	return rows, nil
}

// SetStatus updates a report's status (admin only).
func (s *Service) SetStatus(ctx context.Context, userID, reportID uuid.UUID, status string) error {
	if err := s.requireAdmin(ctx, userID); err != nil {
		return err
	}
	status = strings.TrimSpace(status)
	if _, ok := validStatuses[status]; !ok {
		return httperr.BadRequest("invalid_status", "unknown status")
	}
	n, err := s.repo.SetStatus(ctx, reportID, status)
	if err != nil {
		return httperr.Internal("could not update report").Wrap(err)
	}
	if n == 0 {
		return httperr.NotFound("report_not_found", "report not found")
	}
	return nil
}

// Handler exposes the report endpoint.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the report routes behind auth. The /admin routes
// additionally enforce the admin flag inside the handler.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.POST("/reports", h.Create, authmw)
	g.GET("/admin/reports", h.ListQueue, authmw)
	g.PATCH("/admin/reports/:id", h.SetStatus, authmw)
}

// ListQueue handles GET /admin/reports (admin only).
func (h *Handler) ListQueue(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	rows, err := h.svc.ListQueue(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"reports": rows})
}

// SetStatus handles PATCH /admin/reports/:id (admin only).
func (h *Handler) SetStatus(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid id")
	}
	var req StatusRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := h.svc.SetStatus(c.Request().Context(), userID, id, req.Status); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Create handles POST /reports.
func (h *Handler) Create(c echo.Context) error {
	reporterID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req CreateRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := h.svc.Create(c.Request().Context(), reporterID, req); err != nil {
		return err
	}
	return c.NoContent(http.StatusCreated)
}
