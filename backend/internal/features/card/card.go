// Package card implements Connection Cards: private, typed gestures friends send
// each other to move a relationship forward (thanks, "let's talk again", an
// article share, a consult request, a beacon reply, an intro…). A card carries
// structured context — topic, tags, an optional article, a next action and a
// short message — and is only ever visible to the two people involved. Cards are
// the central forward-motion action of chains' network.
package card

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/url"
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
	maxTopic   = 200
	maxNext    = 200
	maxMessage = 1000
	maxTitle   = 300
	maxTags    = 10
	maxTagLen  = 30
	maxLayout  = 2000
	listLimit  = 200
)

// validTypes is the set of card types the client may send.
var validTypes = map[string]struct{}{
	"thanks":       {},
	"talk_again":   {},
	"article":      {},
	"intro":        {},
	"consult":      {},
	"hackathon":    {},
	"status":       {},
	"ui_review":    {},
	"beacon_reply": {},
}

// validTemplates is the set of visual structure families a sender may pick in
// the Card Studio. The card type drives the content; the template drives the
// layout/look (classic, a postcard, a news clipping, an intro passport).
var validTemplates = map[string]struct{}{
	"classic":  {},
	"postcard": {},
	"clipping": {},
	"passport": {},
}

// validThemes is the set of colour palettes a sender may pick.
var validThemes = map[string]struct{}{
	"paper":    {},
	"midnight": {},
	"sunset":   {},
	"mint":     {},
	"blossom":  {},
	"slate":    {},
}

// UserSummary is the compact, public view of a card's counterpart.
type UserSummary struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
}

// Card is a connection card as returned to a participant. Direction is
// "received" or "sent" relative to the caller.
type Card struct {
	ID           uuid.UUID       `json:"id"`
	Direction    string          `json:"direction"`
	Type         string          `json:"type"`
	Topic        string          `json:"topic,omitempty"`
	Tags         []string        `json:"tags"`
	ArticleURL   string          `json:"article_url,omitempty"`
	ArticleTitle string          `json:"article_title,omitempty"`
	NextAction   string          `json:"next_action,omitempty"`
	Message      string          `json:"message,omitempty"`
	Template     string          `json:"template"`
	Theme        string          `json:"theme"`
	Layout       json.RawMessage `json:"layout"`
	Read         bool            `json:"read"`
	CreatedAt    time.Time       `json:"created_at"`
	Sender       *UserSummary    `json:"sender,omitempty"`
	Recipient    *UserSummary    `json:"recipient,omitempty"`
}

// SendRequest is the body for sending a card.
type SendRequest struct {
	RecipientID  uuid.UUID       `json:"recipient_id"`
	Type         string          `json:"type"`
	Topic        string          `json:"topic"`
	Tags         []string        `json:"tags"`
	ArticleURL   string          `json:"article_url"`
	ArticleTitle string          `json:"article_title"`
	NextAction   string          `json:"next_action"`
	Message      string          `json:"message"`
	Template     string          `json:"template"`
	Theme        string          `json:"theme"`
	Layout       json.RawMessage `json:"layout"`
}

// BridgeRequest is the body for introducing two friends.
type BridgeRequest struct {
	UserAID uuid.UUID `json:"user_a_id"`
	UserBID uuid.UUID `json:"user_b_id"`
	Reason  string    `json:"reason"`
}

// Repository is the card slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// AreFriends reports whether a and b have an accepted friendship.
func (r *Repository) AreFriends(ctx context.Context, a, b uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Friendship{}).
		Where("status = ? AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))",
			models.FriendshipAccepted, a, b, b, a).
		Count(&count).Error
	return count > 0, err
}

// Create inserts a card.
func (r *Repository) Create(ctx context.Context, c *models.Card) error {
	return r.db.WithContext(ctx).Create(c).Error
}

// CreateBridge records a bridge and delivers both intro cards atomically.
func (r *Repository) CreateBridge(ctx context.Context, b *models.Bridge, cards []models.Card) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(b).Error; err != nil {
			return err
		}
		return tx.Create(&cards).Error
	})
}

// Inbox returns cards received by the user, newest first.
func (r *Repository) Inbox(ctx context.Context, me uuid.UUID) ([]models.Card, error) {
	var rows []models.Card
	err := r.db.WithContext(ctx).
		Where("recipient_id = ?", me).
		Order("created_at DESC").Limit(listLimit).Find(&rows).Error
	return rows, err
}

// Sent returns cards sent by the user, newest first.
func (r *Repository) Sent(ctx context.Context, me uuid.UUID) ([]models.Card, error) {
	var rows []models.Card
	err := r.db.WithContext(ctx).
		Where("sender_id = ?", me).
		Order("created_at DESC").Limit(listLimit).Find(&rows).Error
	return rows, err
}

// History returns all cards exchanged between the user and another, newest first.
func (r *Repository) History(ctx context.Context, me, other uuid.UUID) ([]models.Card, error) {
	var rows []models.Card
	err := r.db.WithContext(ctx).
		Where("(sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)",
			me, other, other, me).
		Order("created_at DESC").Limit(listLimit).Find(&rows).Error
	return rows, err
}

// UnreadCount counts unread cards in the user's inbox.
func (r *Repository) UnreadCount(ctx context.Context, me uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Card{}).
		Where("recipient_id = ? AND read_at IS NULL", me).
		Count(&count).Error
	return count, err
}

// MarkRead stamps a received card read (idempotent), returning rows affected.
func (r *Repository) MarkRead(ctx context.Context, me, id uuid.UUID, at time.Time) (int64, error) {
	res := r.db.WithContext(ctx).
		Model(&models.Card{}).
		Where("id = ? AND recipient_id = ? AND read_at IS NULL", id, me).
		Update("read_at", at)
	return res.RowsAffected, res.Error
}

// UsersByIDs loads user rows for the given IDs.
func (r *Repository) UsersByIDs(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]models.User, error) {
	out := make(map[uuid.UUID]models.User)
	if len(ids) == 0 {
		return out, nil
	}
	var users []models.User
	if err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&users).Error; err != nil {
		return nil, err
	}
	for i := range users {
		out[users[i].ID] = users[i]
	}
	return out, nil
}

// Service holds card business logic.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Send validates and delivers a card to a friend.
func (s *Service) Send(ctx context.Context, sender uuid.UUID, req SendRequest) (*Card, error) {
	if req.RecipientID == uuid.Nil || req.RecipientID == sender {
		return nil, httperr.BadRequest("invalid_card", "invalid recipient")
	}
	if _, ok := validTypes[req.Type]; !ok {
		return nil, httperr.BadRequest("invalid_card", "unknown card type")
	}

	friends, err := s.repo.AreFriends(ctx, sender, req.RecipientID)
	if err != nil {
		return nil, httperr.Internal("could not verify friendship").Wrap(err)
	}
	if !friends {
		return nil, httperr.Forbidden("not_friends", "you can only send cards to friends")
	}

	topic, err := clip(req.Topic, maxTopic, "topic")
	if err != nil {
		return nil, err
	}
	next, err := clip(req.NextAction, maxNext, "next action")
	if err != nil {
		return nil, err
	}
	title, err := clip(req.ArticleTitle, maxTitle, "article title")
	if err != nil {
		return nil, err
	}
	message := strings.TrimSpace(req.Message)
	if len([]rune(message)) > maxMessage {
		return nil, httperr.BadRequest("invalid_card", "message is too long")
	}
	articleURL := strings.TrimSpace(req.ArticleURL)
	if articleURL != "" && !validURL(articleURL) {
		return nil, httperr.BadRequest("invalid_card", "article url must be http(s)")
	}
	tags, err := normaliseTags(req.Tags)
	if err != nil {
		return nil, err
	}
	template, theme, layout, err := validateDesign(req.Template, req.Theme, req.Layout)
	if err != nil {
		return nil, err
	}

	c := &models.Card{
		ID:           uuid.New(),
		SenderID:     sender,
		RecipientID:  req.RecipientID,
		Type:         req.Type,
		Topic:        topic,
		Tags:         tags,
		ArticleURL:   articleURL,
		ArticleTitle: title,
		NextAction:   next,
		Message:      message,
		Template:     template,
		Theme:        theme,
		Layout:       layout,
	}
	if err := s.repo.Create(ctx, c); err != nil {
		return nil, httperr.Internal("could not send card").Wrap(err)
	}

	recipient, err := s.summary(ctx, req.RecipientID)
	if err != nil {
		return nil, err
	}
	out := toCard(c, "sent")
	out.Recipient = recipient
	return out, nil
}

// Bridge introduces two of the caller's friends: it records the bridge and sends
// each of them an intro card naming the other and the reason.
func (s *Service) Bridge(ctx context.Context, introducer uuid.UUID, req BridgeRequest) error {
	if req.UserAID == uuid.Nil || req.UserBID == uuid.Nil ||
		req.UserAID == req.UserBID || req.UserAID == introducer || req.UserBID == introducer {
		return httperr.BadRequest("invalid_bridge", "pick two different friends")
	}
	reason, err := clip(req.Reason, maxMessage, "reason")
	if err != nil {
		return err
	}

	for _, id := range []uuid.UUID{req.UserAID, req.UserBID} {
		ok, err := s.repo.AreFriends(ctx, introducer, id)
		if err != nil {
			return httperr.Internal("could not verify friendship").Wrap(err)
		}
		if !ok {
			return httperr.Forbidden("not_friends", "you can only introduce your own friends")
		}
	}

	users, err := s.repo.UsersByIDs(ctx, []uuid.UUID{req.UserAID, req.UserBID})
	if err != nil {
		return httperr.Internal("could not load people").Wrap(err)
	}
	a, okA := users[req.UserAID]
	b, okB := users[req.UserBID]
	if !okA || !okB {
		return httperr.NotFound("user_not_found", "user not found")
	}

	bridge := &models.Bridge{
		ID:           uuid.New(),
		IntroducerID: introducer,
		UserAID:      req.UserAID,
		UserBID:      req.UserBID,
		Reason:       reason,
	}
	// One intro card to each side, naming the other person in the topic.
	cards := []models.Card{
		introCard(introducer, req.UserAID, b.DisplayName, reason),
		introCard(introducer, req.UserBID, a.DisplayName, reason),
	}
	if err := s.repo.CreateBridge(ctx, bridge, cards); err != nil {
		return httperr.Internal("could not create bridge").Wrap(err)
	}
	return nil
}

func introCard(sender, recipient uuid.UUID, otherName, reason string) models.Card {
	return models.Card{
		ID:          uuid.New(),
		SenderID:    sender,
		RecipientID: recipient,
		Type:        "intro",
		Topic:       otherName,
		Message:     reason,
		Tags:        []string{},
		Template:    "classic",
		Theme:       "blossom",
		Layout:      "{}",
	}
}

// validateDesign normalises and checks a card's visual design. An empty template
// or theme falls back to the neutral default; layout must be a small JSON object.
func validateDesign(template, theme string, layout json.RawMessage) (string, string, string, error) {
	if template == "" {
		template = "classic"
	}
	if _, ok := validTemplates[template]; !ok {
		return "", "", "", httperr.BadRequest("invalid_card", "unknown template")
	}
	if theme == "" {
		theme = "paper"
	}
	if _, ok := validThemes[theme]; !ok {
		return "", "", "", httperr.BadRequest("invalid_card", "unknown theme")
	}
	out := "{}"
	if len(layout) > 0 {
		if len(layout) > maxLayout {
			return "", "", "", httperr.BadRequest("invalid_card", "layout is too large")
		}
		trimmed := bytes.TrimSpace(layout)
		if len(trimmed) == 0 || trimmed[0] != '{' || !json.Valid(trimmed) {
			return "", "", "", httperr.BadRequest("invalid_card", "layout must be a JSON object")
		}
		out = string(trimmed)
	}
	return template, theme, out, nil
}

// Inbox returns the cards the user has received.
func (s *Service) Inbox(ctx context.Context, me uuid.UUID) ([]Card, error) {
	rows, err := s.repo.Inbox(ctx, me)
	if err != nil {
		return nil, httperr.Internal("could not load inbox").Wrap(err)
	}
	return s.decorate(ctx, rows, me)
}

// Sent returns the cards the user has sent.
func (s *Service) Sent(ctx context.Context, me uuid.UUID) ([]Card, error) {
	rows, err := s.repo.Sent(ctx, me)
	if err != nil {
		return nil, httperr.Internal("could not load sent cards").Wrap(err)
	}
	return s.decorate(ctx, rows, me)
}

// History returns the cards exchanged with another user.
func (s *Service) History(ctx context.Context, me, other uuid.UUID) ([]Card, error) {
	rows, err := s.repo.History(ctx, me, other)
	if err != nil {
		return nil, httperr.Internal("could not load card history").Wrap(err)
	}
	return s.decorate(ctx, rows, me)
}

// UnreadCount returns the number of unread received cards.
func (s *Service) UnreadCount(ctx context.Context, me uuid.UUID) (int64, error) {
	n, err := s.repo.UnreadCount(ctx, me)
	if err != nil {
		return 0, httperr.Internal("could not count cards").Wrap(err)
	}
	return n, nil
}

// MarkRead marks a received card read.
func (s *Service) MarkRead(ctx context.Context, me, id uuid.UUID) error {
	n, err := s.repo.MarkRead(ctx, me, id, time.Now())
	if err != nil {
		return httperr.Internal("could not mark card read").Wrap(err)
	}
	if n == 0 {
		// Either not the recipient, missing, or already read — treat as success
		// for already-read, not-found otherwise. We can't distinguish cheaply, so
		// a no-op is acceptable (idempotent read).
		return nil
	}
	return nil
}

// decorate turns model cards into DTOs, attaching each counterpart's summary and
// the caller-relative direction in a single user lookup.
func (s *Service) decorate(ctx context.Context, rows []models.Card, me uuid.UUID) ([]Card, error) {
	idset := make(map[uuid.UUID]struct{}, len(rows))
	for i := range rows {
		idset[rows[i].SenderID] = struct{}{}
		idset[rows[i].RecipientID] = struct{}{}
	}
	ids := make([]uuid.UUID, 0, len(idset))
	for id := range idset {
		ids = append(ids, id)
	}
	users, err := s.repo.UsersByIDs(ctx, ids)
	if err != nil {
		return nil, httperr.Internal("could not load people").Wrap(err)
	}
	out := make([]Card, 0, len(rows))
	for i := range rows {
		c := &rows[i]
		direction := "received"
		if c.SenderID == me {
			direction = "sent"
		}
		dto := toCard(c, direction)
		if u, ok := users[c.SenderID]; ok {
			dto.Sender = userSummary(&u)
		}
		if u, ok := users[c.RecipientID]; ok {
			dto.Recipient = userSummary(&u)
		}
		out = append(out, *dto)
	}
	return out, nil
}

func (s *Service) summary(ctx context.Context, id uuid.UUID) (*UserSummary, error) {
	users, err := s.repo.UsersByIDs(ctx, []uuid.UUID{id})
	if err != nil {
		return nil, httperr.Internal("could not load person").Wrap(err)
	}
	if u, ok := users[id]; ok {
		return userSummary(&u), nil
	}
	return nil, httperr.NotFound("user_not_found", "user not found")
}

func toCard(c *models.Card, direction string) *Card {
	tags := c.Tags
	if tags == nil {
		tags = []string{}
	}
	layout := c.Layout
	if layout == "" {
		layout = "{}"
	}
	template := c.Template
	if template == "" {
		template = "classic"
	}
	theme := c.Theme
	if theme == "" {
		theme = "paper"
	}
	return &Card{
		ID:           c.ID,
		Direction:    direction,
		Type:         c.Type,
		Topic:        c.Topic,
		Tags:         tags,
		ArticleURL:   c.ArticleURL,
		ArticleTitle: c.ArticleTitle,
		NextAction:   c.NextAction,
		Message:      c.Message,
		Template:     template,
		Theme:        theme,
		Layout:       json.RawMessage(layout),
		Read:         c.ReadAt != nil,
		CreatedAt:    c.CreatedAt,
	}
}

func userSummary(u *models.User) *UserSummary {
	return &UserSummary{
		ID:              u.ID,
		Username:        u.Username,
		DisplayName:     u.DisplayName,
		AvatarUpdatedAt: u.AvatarUpdatedAt,
	}
}

func clip(raw string, max int, field string) (string, error) {
	s := strings.TrimSpace(raw)
	if len([]rune(s)) > max {
		return "", httperr.BadRequest("invalid_card", field+" is too long")
	}
	return s, nil
}

func normaliseTags(in []string) ([]string, error) {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		t := strings.TrimSpace(raw)
		if t == "" {
			continue
		}
		if len([]rune(t)) > maxTagLen {
			return nil, httperr.BadRequest("invalid_card", "each tag is too long")
		}
		key := strings.ToLower(t)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, t)
	}
	if len(out) > maxTags {
		return nil, httperr.BadRequest("invalid_card", "too many tags")
	}
	return out, nil
}

func validURL(raw string) bool {
	if len(raw) > 600 {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	return (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

// Handler exposes the card endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the card routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.POST("/cards", h.Send, authmw)
	g.POST("/cards/bridge", h.Bridge, authmw)
	g.GET("/cards/inbox", h.Inbox, authmw)
	g.GET("/cards/inbox/unread/count", h.UnreadCount, authmw)
	g.GET("/cards/sent", h.Sent, authmw)
	g.GET("/cards/with/:userId", h.History, authmw)
	g.PATCH("/cards/:id/read", h.MarkRead, authmw)
}

// Send handles POST /cards.
func (h *Handler) Send(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req SendRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	card, err := h.svc.Send(c.Request().Context(), userID, req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, card)
}

// Bridge handles POST /cards/bridge.
func (h *Handler) Bridge(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req BridgeRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := h.svc.Bridge(c.Request().Context(), userID, req); err != nil {
		return err
	}
	return c.NoContent(http.StatusCreated)
}

// Inbox handles GET /cards/inbox.
func (h *Handler) Inbox(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.Inbox(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"cards": list})
}

// Sent handles GET /cards/sent.
func (h *Handler) Sent(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.Sent(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"cards": list})
}

// History handles GET /cards/with/:userId.
func (h *Handler) History(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	other, err := uuid.Parse(c.Param("userId"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid user id")
	}
	list, err := h.svc.History(c.Request().Context(), userID, other)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"cards": list})
}

// UnreadCount handles GET /cards/inbox/unread/count.
func (h *Handler) UnreadCount(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	n, err := h.svc.UnreadCount(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"count": n})
}

// MarkRead handles PATCH /cards/:id/read.
func (h *Handler) MarkRead(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid card id")
	}
	if err := h.svc.MarkRead(c.Request().Context(), userID, id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
