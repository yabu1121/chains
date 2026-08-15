// Package note is the private interaction log a user keeps about people they've
// met: where/when they met, what they talked about (topic tags), the next action
// and its due date, a free memo, and a follow-up *status* (a workflow, not a
// boolean). It is the heart of chains' "remember the people you met" loop —
// visible only to its owner.
package note

import (
	"context"
	"errors"
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
	maxLine    = 200  // where met / what discussed / next action
	maxMemo    = 1000 // free-form memo
	maxTags    = 10
	maxTagLen  = 30
	dateLayout = "2006-01-02"
)

// Response is a note as returned to its owner. SavedAt is nil when no note has
// been written yet, so the client can show an empty (but editable) form.
type Response struct {
	TargetID       uuid.UUID  `json:"target_id"`
	WhereMet       string     `json:"where_met"`
	WhatDiscussed  string     `json:"what_discussed"`
	TopicTags      []string   `json:"topic_tags"`
	NextAction     string     `json:"next_action"`
	MetOn          *string    `json:"met_on"`
	DueOn          *string    `json:"due_on"`
	FollowUpStatus string     `json:"follow_up_status"`
	Memo           string     `json:"memo"`
	SavedAt        *time.Time `json:"saved_at"`
}

// UpdateRequest is the body for creating or updating a note. Dates are
// "YYYY-MM-DD" or empty to clear.
type UpdateRequest struct {
	WhereMet       string   `json:"where_met"`
	WhatDiscussed  string   `json:"what_discussed"`
	TopicTags      []string `json:"topic_tags"`
	NextAction     string   `json:"next_action"`
	MetOn          string   `json:"met_on"`
	DueOn          string   `json:"due_on"`
	FollowUpStatus string   `json:"follow_up_status"`
	Memo           string   `json:"memo"`
}

// StatusRequest is the body for the quick follow-up status change (contacted /
// snoozed / dismissed / …). DueOn is optional and used when snoozing.
type StatusRequest struct {
	FollowUpStatus string `json:"follow_up_status"`
	DueOn          string `json:"due_on"`
}

// UserSummary is the compact, public view of the person a note is about.
type UserSummary struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
}

// FollowUp is one person to reach out to, with the actionable parts of their note.
type FollowUp struct {
	User           UserSummary `json:"user"`
	WhereMet       string      `json:"where_met"`
	WhatDiscussed  string      `json:"what_discussed"`
	NextAction     string      `json:"next_action"`
	DueOn          *string     `json:"due_on"`
	FollowUpStatus string      `json:"follow_up_status"`
	Memo           string      `json:"memo"`
	SavedAt        time.Time   `json:"saved_at"`
}

// Summary is a compact note row used to know which people the owner has logged
// (e.g. to surface "people you haven't noted yet").
type Summary struct {
	TargetID       uuid.UUID `json:"target_id"`
	FollowUpStatus string    `json:"follow_up_status"`
}

// followUpRow is the flat join result for a follow-up note + its target user.
type followUpRow struct {
	TargetID        uuid.UUID
	Username        string
	DisplayName     string
	AvatarUpdatedAt *time.Time
	WhereMet        string
	WhatDiscussed   string
	NextAction      string
	DueOn           *time.Time
	FollowUpStatus  string
	Memo            string
	UpdatedAt       time.Time
}

// Repository is the note slice's data access.
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

// Get returns the owner's note about target, or gorm.ErrRecordNotFound.
func (r *Repository) Get(ctx context.Context, owner, target uuid.UUID) (*models.Note, error) {
	var n models.Note
	err := r.db.WithContext(ctx).
		Where("owner_id = ? AND target_id = ?", owner, target).
		First(&n).Error
	if err != nil {
		return nil, err
	}
	return &n, nil
}

// Upsert creates or updates the owner's note about target, keyed by the unique
// (owner_id, target_id) pair.
func (r *Repository) Upsert(ctx context.Context, n *models.Note) error {
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "owner_id"}, {Name: "target_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"where_met", "what_discussed", "topic_tags", "next_action",
			"met_on", "due_on", "follow_up_status", "memo", "updated_at",
		}),
	}).Create(n).Error
}

// UpdateStatus changes only the follow-up status (and due date) of an existing
// note, returning rows affected.
func (r *Repository) UpdateStatus(ctx context.Context, owner, target uuid.UUID, status models.FollowUpStatus, due *time.Time, at time.Time) (int64, error) {
	res := r.db.WithContext(ctx).
		Model(&models.Note{}).
		Where("owner_id = ? AND target_id = ?", owner, target).
		Updates(map[string]any{"follow_up_status": status, "due_on": due, "updated_at": at})
	return res.RowsAffected, res.Error
}

// ListFollowUps returns the owner's actionable follow-ups: everything pending,
// plus snoozed items whose reminder date has arrived.
func (r *Repository) ListFollowUps(ctx context.Context, owner uuid.UUID, today time.Time) ([]followUpRow, error) {
	var rows []followUpRow
	err := r.db.WithContext(ctx).
		Table("notes n").
		Select("n.target_id, u.username, u.display_name, u.avatar_updated_at, n.where_met, n.what_discussed, n.next_action, n.due_on, n.follow_up_status, n.memo, n.updated_at").
		Joins("JOIN users u ON u.id = n.target_id").
		Where("n.owner_id = ? AND (n.follow_up_status = 'pending' OR (n.follow_up_status = 'snoozed' AND (n.due_on IS NULL OR n.due_on <= ?)))", owner, today).
		Order("n.due_on ASC NULLS LAST, n.updated_at DESC").
		Scan(&rows).Error
	return rows, err
}

// ListSummaries returns a compact row for every note the owner holds.
func (r *Repository) ListSummaries(ctx context.Context, owner uuid.UUID) ([]Summary, error) {
	var rows []Summary
	err := r.db.WithContext(ctx).
		Model(&models.Note{}).
		Select("target_id, follow_up_status").
		Where("owner_id = ?", owner).
		Scan(&rows).Error
	return rows, err
}

// Delete removes the owner's note about target and reports rows removed.
func (r *Repository) Delete(ctx context.Context, owner, target uuid.UUID) (int64, error) {
	res := r.db.WithContext(ctx).
		Where("owner_id = ? AND target_id = ?", owner, target).
		Delete(&models.Note{})
	return res.RowsAffected, res.Error
}

// Service holds note business logic.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Get returns the owner's note about target. A missing note resolves to an empty
// note (SavedAt nil) so the editor can render a blank form.
func (s *Service) Get(ctx context.Context, owner, target uuid.UUID) (*Response, error) {
	n, err := s.repo.Get(ctx, owner, target)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &Response{TargetID: target, TopicTags: []string{}, FollowUpStatus: string(models.FollowUpNone)}, nil
		}
		return nil, httperr.Internal("could not load note").Wrap(err)
	}
	return toResponse(n), nil
}

// Save validates and upserts the owner's note about target.
func (s *Service) Save(ctx context.Context, owner, target uuid.UUID, req UpdateRequest) (*Response, error) {
	if owner == target {
		return nil, httperr.BadRequest("self_note", "you cannot keep a note about yourself")
	}

	whereMet, err := validLine(req.WhereMet, "where met")
	if err != nil {
		return nil, err
	}
	whatDiscussed, err := validLine(req.WhatDiscussed, "what discussed")
	if err != nil {
		return nil, err
	}
	nextAction, err := validLine(req.NextAction, "next action")
	if err != nil {
		return nil, err
	}
	memo := strings.TrimSpace(req.Memo)
	if len([]rune(memo)) > maxMemo {
		return nil, httperr.BadRequest("invalid_note", "memo must be at most 1000 characters")
	}
	tags, err := normaliseTags(req.TopicTags)
	if err != nil {
		return nil, err
	}
	metOn, err := parseDate(req.MetOn)
	if err != nil {
		return nil, err
	}
	dueOn, err := parseDate(req.DueOn)
	if err != nil {
		return nil, err
	}
	status, err := parseStatus(req.FollowUpStatus)
	if err != nil {
		return nil, err
	}

	exists, err := s.repo.UserExists(ctx, target)
	if err != nil {
		return nil, httperr.Internal("could not verify user").Wrap(err)
	}
	if !exists {
		return nil, httperr.NotFound("user_not_found", "user not found")
	}

	n := &models.Note{
		ID:             uuid.New(),
		OwnerID:        owner,
		TargetID:       target,
		WhereMet:       whereMet,
		WhatDiscussed:  whatDiscussed,
		TopicTags:      tags,
		NextAction:     nextAction,
		MetOn:          metOn,
		DueOn:          dueOn,
		FollowUpStatus: status,
		Memo:           memo,
	}
	if err := s.repo.Upsert(ctx, n); err != nil {
		return nil, httperr.Internal("could not save note").Wrap(err)
	}
	return s.Get(ctx, owner, target)
}

// SetStatus changes just the follow-up status (and optional due date) of an
// existing note — the quick "contacted / snooze / dismiss" action.
func (s *Service) SetStatus(ctx context.Context, owner, target uuid.UUID, req StatusRequest) error {
	status, err := parseStatus(req.FollowUpStatus)
	if err != nil {
		return err
	}
	due, err := parseDate(req.DueOn)
	if err != nil {
		return err
	}
	n, err := s.repo.UpdateStatus(ctx, owner, target, status, due, time.Now())
	if err != nil {
		return httperr.Internal("could not update follow-up").Wrap(err)
	}
	if n == 0 {
		return httperr.NotFound("note_not_found", "no note for this person yet")
	}
	return nil
}

// FollowUps returns the people the owner should reach out to now.
func (s *Service) FollowUps(ctx context.Context, owner uuid.UUID) ([]FollowUp, error) {
	rows, err := s.repo.ListFollowUps(ctx, owner, time.Now().UTC())
	if err != nil {
		return nil, httperr.Internal("could not load follow-ups").Wrap(err)
	}
	out := make([]FollowUp, 0, len(rows))
	for i := range rows {
		r := &rows[i]
		out = append(out, FollowUp{
			User: UserSummary{
				ID:              r.TargetID,
				Username:        r.Username,
				DisplayName:     r.DisplayName,
				AvatarUpdatedAt: r.AvatarUpdatedAt,
			},
			WhereMet:       r.WhereMet,
			WhatDiscussed:  r.WhatDiscussed,
			NextAction:     r.NextAction,
			DueOn:          formatDate(r.DueOn),
			FollowUpStatus: r.FollowUpStatus,
			Memo:           r.Memo,
			SavedAt:        r.UpdatedAt,
		})
	}
	return out, nil
}

// Summaries returns a compact row for every note the owner holds.
func (s *Service) Summaries(ctx context.Context, owner uuid.UUID) ([]Summary, error) {
	rows, err := s.repo.ListSummaries(ctx, owner)
	if err != nil {
		return nil, httperr.Internal("could not load notes").Wrap(err)
	}
	return rows, nil
}

// Delete removes the owner's note about target.
func (s *Service) Delete(ctx context.Context, owner, target uuid.UUID) error {
	n, err := s.repo.Delete(ctx, owner, target)
	if err != nil {
		return httperr.Internal("could not delete note").Wrap(err)
	}
	if n == 0 {
		return httperr.NotFound("note_not_found", "no note to delete")
	}
	return nil
}

func toResponse(n *models.Note) *Response {
	updated := n.UpdatedAt
	tags := n.TopicTags
	if tags == nil {
		tags = []string{}
	}
	return &Response{
		TargetID:       n.TargetID,
		WhereMet:       n.WhereMet,
		WhatDiscussed:  n.WhatDiscussed,
		TopicTags:      tags,
		NextAction:     n.NextAction,
		MetOn:          formatDate(n.MetOn),
		DueOn:          formatDate(n.DueOn),
		FollowUpStatus: string(n.FollowUpStatus),
		Memo:           n.Memo,
		SavedAt:        &updated,
	}
}

// validLine trims a single-line note field and enforces the shared length cap.
func validLine(raw, field string) (string, error) {
	s := strings.TrimSpace(raw)
	if len([]rune(s)) > maxLine {
		return "", httperr.BadRequest("invalid_note", field+" must be at most 200 characters")
	}
	return s, nil
}

// normaliseTags trims, de-duplicates (case-insensitively) and caps topic tags.
func normaliseTags(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		if len([]rune(t)) > maxTagLen {
			return nil, httperr.BadRequest("invalid_note", "each tag must be at most 30 characters")
		}
		key := strings.ToLower(t)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	if len(out) > maxTags {
		return nil, httperr.BadRequest("invalid_note", "too many tags (max 10)")
	}
	return out, nil
}

// parseDate parses "YYYY-MM-DD" (empty → nil).
func parseDate(raw string) (*time.Time, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil, nil
	}
	d, err := time.Parse(dateLayout, s)
	if err != nil {
		return nil, httperr.BadRequest("invalid_note", "dates must be YYYY-MM-DD")
	}
	return &d, nil
}

func formatDate(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(dateLayout)
	return &s
}

// parseStatus validates a follow-up status; empty defaults to "none".
func parseStatus(raw string) (models.FollowUpStatus, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return models.FollowUpNone, nil
	}
	st := models.FollowUpStatus(s)
	if !st.Valid() {
		return "", httperr.BadRequest("invalid_note", "unknown follow-up status")
	}
	return st, nil
}

// Handler exposes the note endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the note routes behind auth. Static routes are registered
// alongside the parameterised ones; Echo matches the static paths first.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/notes", h.ListSummaries, authmw)
	g.GET("/notes/follow-ups", h.FollowUps, authmw)
	g.GET("/notes/:userId", h.Get, authmw)
	g.PUT("/notes/:userId", h.Save, authmw)
	g.PATCH("/notes/:userId/status", h.SetStatus, authmw)
	g.DELETE("/notes/:userId", h.Delete, authmw)
}

// ListSummaries handles GET /notes.
func (h *Handler) ListSummaries(c echo.Context) error {
	owner, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.Summaries(c.Request().Context(), owner)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"notes": list})
}

// FollowUps handles GET /notes/follow-ups.
func (h *Handler) FollowUps(c echo.Context) error {
	owner, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.FollowUps(c.Request().Context(), owner)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"follow_ups": list})
}

// Get handles GET /notes/:userId.
func (h *Handler) Get(c echo.Context) error {
	owner, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	target, err := pathUUID(c, "userId")
	if err != nil {
		return err
	}
	resp, err := h.svc.Get(c.Request().Context(), owner, target)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, resp)
}

// Save handles PUT /notes/:userId.
func (h *Handler) Save(c echo.Context) error {
	owner, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	target, err := pathUUID(c, "userId")
	if err != nil {
		return err
	}
	var req UpdateRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	resp, err := h.svc.Save(c.Request().Context(), owner, target, req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, resp)
}

// SetStatus handles PATCH /notes/:userId/status.
func (h *Handler) SetStatus(c echo.Context) error {
	owner, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	target, err := pathUUID(c, "userId")
	if err != nil {
		return err
	}
	var req StatusRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := h.svc.SetStatus(c.Request().Context(), owner, target, req); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /notes/:userId.
func (h *Handler) Delete(c echo.Context) error {
	owner, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	target, err := pathUUID(c, "userId")
	if err != nil {
		return err
	}
	if err := h.svc.Delete(c.Request().Context(), owner, target); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

func pathUUID(c echo.Context, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		return uuid.Nil, httperr.BadRequest("invalid_id", "invalid "+name)
	}
	return id, nil
}
