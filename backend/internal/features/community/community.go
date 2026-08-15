// Package community lets users group themselves around a shared context — a tech
// event, hackathon, school, lab or community — and see that group as a roster
// with a relationship map. It is the "名簿付き関係マップ" the product is best
// pitched as: after an event you can look back at who was there and how everyone
// is connected. Membership is open: anyone may create a community and join one.
package community

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
	maxName        = 60
	maxDescription = 300
	maxMembers     = 2000 // roster cap for the detail/network payloads
)

// Summary is a community in a list: its basics, how many have joined, and
// whether the caller is a member.
type Summary struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	MemberCount int       `json:"member_count"`
	IsMember    bool      `json:"is_member"`
	IsOwner     bool      `json:"is_owner"`
	CreatedAt   time.Time `json:"created_at"`
}

// Member is one person on a community roster.
type Member struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
	JobTitle        string     `json:"job_title"`
}

// Detail is a community plus its roster.
type Detail struct {
	Summary
	Members []Member `json:"members"`
}

// Node is a member vertex in the community relationship map.
type Node struct {
	ID              uuid.UUID  `json:"id" gorm:"column:id"`
	DisplayName     string     `json:"display_name" gorm:"column:display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at" gorm:"column:avatar_updated_at"`
}

// Link is an accepted friendship between two members.
type Link struct {
	Source uuid.UUID `json:"source" gorm:"column:source"`
	Target uuid.UUID `json:"target" gorm:"column:target"`
}

// NetworkResponse is the relationship sub-graph among a community's members.
type NetworkResponse struct {
	Nodes []Node `json:"nodes"`
	Links []Link `json:"links"`
}

// CreateRequest is the body for creating a community.
type CreateRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// Repository is the community slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Create inserts a community and adds its creator as the first member, atomically.
func (r *Repository) Create(ctx context.Context, c *models.Community) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(c).Error; err != nil {
			return err
		}
		m := &models.CommunityMember{ID: uuid.New(), CommunityID: c.ID, UserID: c.CreatedBy}
		return tx.Create(m).Error
	})
}

// Get loads a community by ID, or gorm.ErrRecordNotFound.
func (r *Repository) Get(ctx context.Context, id uuid.UUID) (*models.Community, error) {
	var c models.Community
	if err := r.db.WithContext(ctx).First(&c, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

// List returns all communities, most members first.
func (r *Repository) List(ctx context.Context) ([]models.Community, error) {
	var rows []models.Community
	err := r.db.WithContext(ctx).Order("created_at DESC").Find(&rows).Error
	return rows, err
}

// MemberCounts returns the member count for every community, keyed by ID.
func (r *Repository) MemberCounts(ctx context.Context) (map[uuid.UUID]int, error) {
	type row struct {
		CommunityID uuid.UUID
		N           int
	}
	var rows []row
	err := r.db.WithContext(ctx).
		Model(&models.CommunityMember{}).
		Select("community_id, COUNT(*) AS n").
		Group("community_id").
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]int, len(rows))
	for _, r := range rows {
		out[r.CommunityID] = r.N
	}
	return out, nil
}

// MyCommunityIDs returns the set of communities the user belongs to.
func (r *Repository) MyCommunityIDs(ctx context.Context, userID uuid.UUID) (map[uuid.UUID]struct{}, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&models.CommunityMember{}).
		Where("user_id = ?", userID).
		Pluck("community_id", &ids).Error
	if err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		out[id] = struct{}{}
	}
	return out, nil
}

// IsMember reports whether a user belongs to a community.
func (r *Repository) IsMember(ctx context.Context, communityID, userID uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.CommunityMember{}).
		Where("community_id = ? AND user_id = ?", communityID, userID).
		Count(&count).Error
	return count > 0, err
}

// AddMember joins a user to a community; a repeated join is a no-op.
func (r *Repository) AddMember(ctx context.Context, communityID, userID uuid.UUID) error {
	m := &models.CommunityMember{ID: uuid.New(), CommunityID: communityID, UserID: userID}
	return r.db.WithContext(ctx).
		Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "community_id"}, {Name: "user_id"}},
			DoNothing: true,
		}).
		Create(m).Error
}

// RemoveMember removes a membership and reports rows removed.
func (r *Repository) RemoveMember(ctx context.Context, communityID, userID uuid.UUID) (int64, error) {
	res := r.db.WithContext(ctx).
		Where("community_id = ? AND user_id = ?", communityID, userID).
		Delete(&models.CommunityMember{})
	return res.RowsAffected, res.Error
}

// Delete removes a community and all of its memberships, atomically.
func (r *Repository) Delete(ctx context.Context, communityID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("community_id = ?", communityID).
			Delete(&models.CommunityMember{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.Community{}, "id = ?", communityID).Error
	})
}

// Members returns a community's members (joined-order), capped.
func (r *Repository) Members(ctx context.Context, communityID uuid.UUID) ([]models.User, error) {
	var users []models.User
	err := r.db.WithContext(ctx).
		Joins("JOIN community_members cm ON cm.user_id = users.id").
		Where("cm.community_id = ?", communityID).
		Order("cm.joined_at ASC").
		Limit(maxMembers).
		Find(&users).Error
	return users, err
}

// MemberIDs returns a community's member IDs, capped.
func (r *Repository) MemberIDs(ctx context.Context, communityID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Model(&models.CommunityMember{}).
		Where("community_id = ?", communityID).
		Limit(maxMembers).
		Pluck("user_id", &ids).Error
	return ids, err
}

// EdgesAmong returns accepted friendships where both endpoints are in ids.
func (r *Repository) EdgesAmong(ctx context.Context, ids []uuid.UUID) ([]Link, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var links []Link
	err := r.db.WithContext(ctx).
		Table("friendships").
		Select("requester_id AS source, addressee_id AS target").
		Where("status = ? AND requester_id IN ? AND addressee_id IN ?",
			models.FriendshipAccepted, ids, ids).
		Scan(&links).Error
	return links, err
}

// Service holds community business logic.
type Service struct {
	repo *Repository
}

// NewService builds a Service.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Create validates and creates a community owned by userID (who auto-joins).
func (s *Service) Create(ctx context.Context, userID uuid.UUID, req CreateRequest) (*Summary, error) {
	name := strings.TrimSpace(req.Name)
	if n := len([]rune(name)); n < 1 || n > maxName {
		return nil, httperr.BadRequest("invalid_community", "name must be 1-60 characters")
	}
	desc := strings.TrimSpace(req.Description)
	if len([]rune(desc)) > maxDescription {
		return nil, httperr.BadRequest("invalid_community", "description must be at most 300 characters")
	}
	c := &models.Community{
		ID:          uuid.New(),
		Name:        name,
		Description: desc,
		CreatedBy:   userID,
	}
	if err := s.repo.Create(ctx, c); err != nil {
		return nil, httperr.Internal("could not create community").Wrap(err)
	}
	return &Summary{
		ID:          c.ID,
		Name:        c.Name,
		Description: c.Description,
		MemberCount: 1,
		IsMember:    true,
		IsOwner:     true,
		CreatedAt:   c.CreatedAt,
	}, nil
}

// List returns every community with member counts and the caller's membership.
func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]Summary, error) {
	rows, err := s.repo.List(ctx)
	if err != nil {
		return nil, httperr.Internal("could not load communities").Wrap(err)
	}
	counts, err := s.repo.MemberCounts(ctx)
	if err != nil {
		return nil, httperr.Internal("could not count members").Wrap(err)
	}
	mine, err := s.repo.MyCommunityIDs(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load memberships").Wrap(err)
	}
	out := make([]Summary, 0, len(rows))
	for i := range rows {
		c := &rows[i]
		_, isMember := mine[c.ID]
		out = append(out, Summary{
			ID:          c.ID,
			Name:        c.Name,
			Description: c.Description,
			MemberCount: counts[c.ID],
			IsMember:    isMember,
			IsOwner:     c.CreatedBy == userID,
			CreatedAt:   c.CreatedAt,
		})
	}
	return out, nil
}

// Get returns a community with its roster.
func (s *Service) Get(ctx context.Context, userID, id uuid.UUID) (*Detail, error) {
	c, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("community_not_found", "community not found")
		}
		return nil, httperr.Internal("could not load community").Wrap(err)
	}
	users, err := s.repo.Members(ctx, id)
	if err != nil {
		return nil, httperr.Internal("could not load members").Wrap(err)
	}
	members := make([]Member, 0, len(users))
	isMember := false
	for i := range users {
		u := &users[i]
		if u.ID == userID {
			isMember = true
		}
		members = append(members, Member{
			ID:              u.ID,
			Username:        u.Username,
			DisplayName:     u.DisplayName,
			AvatarUpdatedAt: u.AvatarUpdatedAt,
			JobTitle:        u.JobTitle,
		})
	}
	return &Detail{
		Summary: Summary{
			ID:          c.ID,
			Name:        c.Name,
			Description: c.Description,
			MemberCount: len(members),
			IsMember:    isMember,
			IsOwner:     c.CreatedBy == userID,
			CreatedAt:   c.CreatedAt,
		},
		Members: members,
	}, nil
}

// Join adds the caller to a community.
func (s *Service) Join(ctx context.Context, userID, id uuid.UUID) error {
	if _, err := s.repo.Get(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return httperr.NotFound("community_not_found", "community not found")
		}
		return httperr.Internal("could not load community").Wrap(err)
	}
	if err := s.repo.AddMember(ctx, id, userID); err != nil {
		return httperr.Internal("could not join community").Wrap(err)
	}
	return nil
}

// Leave removes the caller from a community.
func (s *Service) Leave(ctx context.Context, userID, id uuid.UUID) error {
	n, err := s.repo.RemoveMember(ctx, id, userID)
	if err != nil {
		return httperr.Internal("could not leave community").Wrap(err)
	}
	if n == 0 {
		return httperr.NotFound("not_a_member", "you are not a member of this community")
	}
	return nil
}

// Delete removes a community entirely. Only its owner (creator) may do so.
func (s *Service) Delete(ctx context.Context, userID, id uuid.UUID) error {
	c, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return httperr.NotFound("community_not_found", "community not found")
		}
		return httperr.Internal("could not load community").Wrap(err)
	}
	if c.CreatedBy != userID {
		return httperr.Forbidden("not_owner", "only the owner can delete this")
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		return httperr.Internal("could not delete community").Wrap(err)
	}
	return nil
}

// Network returns the relationship sub-graph among a community's members: each
// member is a node, each accepted friendship between two members is a link.
func (s *Service) Network(ctx context.Context, id uuid.UUID) (*NetworkResponse, error) {
	if _, err := s.repo.Get(ctx, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("community_not_found", "community not found")
		}
		return nil, httperr.Internal("could not load community").Wrap(err)
	}
	users, err := s.repo.Members(ctx, id)
	if err != nil {
		return nil, httperr.Internal("could not load members").Wrap(err)
	}
	nodes := make([]Node, 0, len(users))
	ids := make([]uuid.UUID, 0, len(users))
	for i := range users {
		nodes = append(nodes, Node{
			ID:              users[i].ID,
			DisplayName:     users[i].DisplayName,
			AvatarUpdatedAt: users[i].AvatarUpdatedAt,
		})
		ids = append(ids, users[i].ID)
	}
	links, err := s.repo.EdgesAmong(ctx, ids)
	if err != nil {
		return nil, httperr.Internal("could not load connections").Wrap(err)
	}
	if links == nil {
		links = []Link{}
	}
	return &NetworkResponse{Nodes: nodes, Links: links}, nil
}

// Handler exposes the community endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the community routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.POST("/communities", h.Create, authmw)
	g.GET("/communities", h.List, authmw)
	g.GET("/communities/:id", h.Get, authmw)
	g.GET("/communities/:id/network", h.Network, authmw)
	g.POST("/communities/:id/join", h.Join, authmw)
	g.DELETE("/communities/:id/leave", h.Leave, authmw)
	g.DELETE("/communities/:id", h.Delete, authmw)
}

// Create handles POST /communities.
func (h *Handler) Create(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req CreateRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	resp, err := h.svc.Create(c.Request().Context(), userID, req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, resp)
}

// List handles GET /communities.
func (h *Handler) List(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.List(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"communities": list})
}

// Get handles GET /communities/:id.
func (h *Handler) Get(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := pathUUID(c, "id")
	if err != nil {
		return err
	}
	detail, err := h.svc.Get(c.Request().Context(), userID, id)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, detail)
}

// Network handles GET /communities/:id/network.
func (h *Handler) Network(c echo.Context) error {
	if _, err := middleware.MustUserID(c); err != nil {
		return err
	}
	id, err := pathUUID(c, "id")
	if err != nil {
		return err
	}
	resp, err := h.svc.Network(c.Request().Context(), id)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, resp)
}

// Join handles POST /communities/:id/join.
func (h *Handler) Join(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := pathUUID(c, "id")
	if err != nil {
		return err
	}
	if err := h.svc.Join(c.Request().Context(), userID, id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Leave handles DELETE /communities/:id/leave.
func (h *Handler) Leave(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := pathUUID(c, "id")
	if err != nil {
		return err
	}
	if err := h.svc.Leave(c.Request().Context(), userID, id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Delete handles DELETE /communities/:id (owner only).
func (h *Handler) Delete(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := pathUUID(c, "id")
	if err != nil {
		return err
	}
	if err := h.svc.Delete(c.Request().Context(), userID, id); err != nil {
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
