// Package network exposes the global friendship graph (all users as nodes,
// accepted friendships as links) for visualisation. Only public fields (id and
// display name) are returned — never email — and the result is capped and
// briefly cached because it is identical for every viewer.
package network

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/httperr"
)

// GlobalCacheKey is the cache key for the global graph. It is exported so the
// slices that mutate the graph (friend, profile) can invalidate it.
const GlobalCacheKey = "network:global:v1"

const (
	maxNodes = 2000
	maxLinks = 8000
	cacheTTL = 30 * time.Second
)

// Node is a user vertex.
type Node struct {
	ID          uuid.UUID `json:"id"`
	DisplayName string    `json:"display_name"`
}

// Link is an accepted-friendship edge. Source/Target are user IDs.
type Link struct {
	Source uuid.UUID `json:"source"`
	Target uuid.UUID `json:"target"`
}

// Response is the graph payload.
type Response struct {
	Nodes     []Node `json:"nodes"`
	Links     []Link `json:"links"`
	Truncated bool   `json:"truncated"`
}

// Repository reads the graph from the database.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Users returns up to limit user vertices.
func (r *Repository) Users(ctx context.Context, limit int) ([]Node, error) {
	var nodes []Node
	err := r.db.WithContext(ctx).
		Model(&models.User{}).
		Select("id", "display_name").
		Order("created_at ASC").
		Limit(limit).
		Find(&nodes).Error
	return nodes, err
}

// AcceptedEdges returns up to limit accepted-friendship edges.
func (r *Repository) AcceptedEdges(ctx context.Context, limit int) ([]Link, error) {
	var links []Link
	err := r.db.WithContext(ctx).
		Table("friendships").
		Select("requester_id AS source, addressee_id AS target").
		Where("status = ?", models.FriendshipAccepted).
		Limit(limit).
		Scan(&links).Error
	return links, err
}

// Service assembles the graph and applies a short shared cache.
type Service struct {
	repo  *Repository
	cache cache.Cache
}

// NewService builds a Service. cache may be nil to disable caching.
func NewService(repo *Repository, c cache.Cache) *Service {
	return &Service{repo: repo, cache: c}
}

// Global returns the whole friendship graph, capped and cached.
func (s *Service) Global(ctx context.Context) (*Response, error) {
	if s.cache != nil {
		if cached, ok, err := cache.GetJSON[Response](ctx, s.cache, GlobalCacheKey); err == nil && ok {
			return &cached, nil
		}
	}

	// Fetch one extra node to detect truncation.
	nodes, err := s.repo.Users(ctx, maxNodes+1)
	if err != nil {
		return nil, httperr.Internal("could not load users").Wrap(err)
	}
	truncated := len(nodes) > maxNodes
	if truncated {
		nodes = nodes[:maxNodes]
	}

	present := make(map[uuid.UUID]struct{}, len(nodes))
	for _, n := range nodes {
		present[n.ID] = struct{}{}
	}

	edges, err := s.repo.AcceptedEdges(ctx, maxLinks)
	if err != nil {
		return nil, httperr.Internal("could not load friendships").Wrap(err)
	}

	// Keep only edges whose both endpoints are within the node set, so the
	// frontend never references a missing node.
	links := make([]Link, 0, len(edges))
	for _, e := range edges {
		if _, ok := present[e.Source]; !ok {
			continue
		}
		if _, ok := present[e.Target]; !ok {
			continue
		}
		links = append(links, e)
	}

	resp := &Response{Nodes: nodes, Links: links, Truncated: truncated}

	if s.cache != nil {
		_ = cache.SetJSON(ctx, s.cache, GlobalCacheKey, resp, cacheTTL)
	}
	return resp, nil
}

// Handler exposes the network endpoint.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the network route behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/network", h.Global, authmw)
}

// Global handles GET /network.
func (h *Handler) Global(c echo.Context) error {
	resp, err := h.svc.Global(c.Request().Context())
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, resp)
}
