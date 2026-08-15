// Package recommendation suggests people a user might want to connect with —
// "who should I talk to next?" — turning the network from something you look at
// into something that introduces you to people. Candidates are friends-of-friends
// (second-degree connections), ranked by how many friends you have in common and
// how much of your tech stack you share, each carrying the reason it was surfaced.
package recommendation

import (
	"context"
	"database/sql"
	"net/http"
	"sort"
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
	defaultLimit = 12
	maxLimit     = 50
	// maxEdges caps how much of the friendship graph we load when scoring
	// second-degree connections (friend-app scale; mirrors the network slice).
	maxEdges = 8000
)

// edge is one accepted friendship as an undirected pair. The column tags let
// GORM scan `requester_id AS source, addressee_id AS target` into it.
type edge struct {
	Source uuid.UUID `gorm:"column:source"`
	Target uuid.UUID `gorm:"column:target"`
}

// UserSummary is the compact, public view of a recommended user.
type UserSummary struct {
	ID              uuid.UUID  `json:"id"`
	Username        string     `json:"username"`
	DisplayName     string     `json:"display_name"`
	AvatarUpdatedAt *time.Time `json:"avatar_updated_at"`
}

// Recommendation is one suggested person plus why they were suggested.
type Recommendation struct {
	User            UserSummary `json:"user"`
	MutualFriends   int         `json:"mutual_friends"`
	SharedLanguages []string    `json:"shared_languages"`
}

// store is the data access the service needs; satisfied by *Repository and by
// mocks in tests.
type store interface {
	AcceptedFriendIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)
	AcceptedEdges(ctx context.Context) ([]edge, error)
	ExcludedIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error)
	UsersByIDs(ctx context.Context, ids []uuid.UUID) ([]models.User, error)
	LanguagesByUsers(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID][]string, error)
	LanguagesFor(ctx context.Context, userID uuid.UUID) ([]string, error)
}

// Repository is the recommendation slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// AcceptedFriendIDs returns the IDs of a user's accepted friends.
func (r *Repository) AcceptedFriendIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Raw(`SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
		     FROM friendships
		     WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
			userID, userID, userID).
		Scan(&ids).Error
	return ids, err
}

// AcceptedEdges returns up to maxEdges accepted friendships as undirected pairs.
func (r *Repository) AcceptedEdges(ctx context.Context) ([]edge, error) {
	var edges []edge
	err := r.db.WithContext(ctx).
		Table("friendships").
		Select("requester_id AS source, addressee_id AS target").
		Where("status = ?", models.FriendshipAccepted).
		Limit(maxEdges).
		Scan(&edges).Error
	return edges, err
}

// ExcludedIDs returns users that must never be recommended to userID: anyone
// they've blocked or been blocked by, and anyone with a pending request either
// way (so we don't re-suggest people already in flight).
func (r *Repository) ExcludedIDs(ctx context.Context, userID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := r.db.WithContext(ctx).
		Raw(`SELECT blocked_id FROM blocks WHERE blocker_id = @u
		     UNION SELECT blocker_id FROM blocks WHERE blocked_id = @u
		     UNION SELECT addressee_id FROM friendships WHERE requester_id = @u AND status = 'pending'
		     UNION SELECT requester_id FROM friendships WHERE addressee_id = @u AND status = 'pending'`,
			sql.Named("u", userID)).
		Scan(&ids).Error
	return ids, err
}

// UsersByIDs loads user rows for the given IDs.
func (r *Repository) UsersByIDs(ctx context.Context, ids []uuid.UUID) ([]models.User, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	var users []models.User
	err := r.db.WithContext(ctx).Where("id IN ?", ids).Find(&users).Error
	return users, err
}

// LanguagesByUsers returns each given user's languages, keyed by user ID.
func (r *Repository) LanguagesByUsers(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID][]string, error) {
	out := make(map[uuid.UUID][]string)
	if len(ids) == 0 {
		return out, nil
	}
	var rows []models.UserLanguage
	err := r.db.WithContext(ctx).
		Where("user_id IN ?", ids).
		Order("user_id, position ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.UserID] = append(out[row.UserID], row.Language)
	}
	return out, nil
}

// LanguagesFor returns a single user's languages in their chosen order.
func (r *Repository) LanguagesFor(ctx context.Context, userID uuid.UUID) ([]string, error) {
	var ls []string
	err := r.db.WithContext(ctx).
		Model(&models.UserLanguage{}).
		Where("user_id = ?", userID).
		Order("position ASC").
		Pluck("language", &ls).Error
	return ls, err
}

// Service computes recommendations.
type Service struct {
	store store
}

// NewService builds a Service.
func NewService(store store) *Service {
	return &Service{store: store}
}

// Recommend returns up to limit second-degree connections for userID, ranked by
// mutual friends then shared languages.
func (s *Service) Recommend(ctx context.Context, userID uuid.UUID, limit int) ([]Recommendation, error) {
	friendIDs, err := s.store.AcceptedFriendIDs(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load friends").Wrap(err)
	}
	edges, err := s.store.AcceptedEdges(ctx)
	if err != nil {
		return nil, httperr.Internal("could not load graph").Wrap(err)
	}
	excludedList, err := s.store.ExcludedIDs(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load exclusions").Wrap(err)
	}

	// Build the set of people to never recommend: yourself, existing friends,
	// and anyone blocked or with a pending request.
	excluded := map[uuid.UUID]struct{}{userID: {}}
	for _, id := range friendIDs {
		excluded[id] = struct{}{}
	}
	for _, id := range excludedList {
		excluded[id] = struct{}{}
	}

	// Adjacency over the accepted graph.
	adj := make(map[uuid.UUID][]uuid.UUID, len(edges)*2)
	for _, e := range edges {
		adj[e.Source] = append(adj[e.Source], e.Target)
		adj[e.Target] = append(adj[e.Target], e.Source)
	}

	// For each friend, every *their* friend who isn't excluded is a candidate;
	// the number of your friends pointing at them is the mutual-friend count.
	mutual := make(map[uuid.UUID]int)
	for _, f := range friendIDs {
		for _, n := range adj[f] {
			if _, skip := excluded[n]; skip {
				continue
			}
			mutual[n]++
		}
	}
	if len(mutual) == 0 {
		return []Recommendation{}, nil
	}

	candidateIDs := make([]uuid.UUID, 0, len(mutual))
	for id := range mutual {
		candidateIDs = append(candidateIDs, id)
	}

	myLangs, err := s.store.LanguagesFor(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load languages").Wrap(err)
	}
	mine := make(map[string]struct{}, len(myLangs))
	for _, l := range myLangs {
		mine[strings.ToLower(l)] = struct{}{}
	}

	langsByUser, err := s.store.LanguagesByUsers(ctx, candidateIDs)
	if err != nil {
		return nil, httperr.Internal("could not load languages").Wrap(err)
	}
	users, err := s.store.UsersByIDs(ctx, candidateIDs)
	if err != nil {
		return nil, httperr.Internal("could not load users").Wrap(err)
	}

	recs := make([]Recommendation, 0, len(users))
	for i := range users {
		u := &users[i]
		shared := make([]string, 0)
		for _, l := range langsByUser[u.ID] {
			if _, ok := mine[strings.ToLower(l)]; ok {
				shared = append(shared, l)
			}
		}
		recs = append(recs, Recommendation{
			User: UserSummary{
				ID:              u.ID,
				Username:        u.Username,
				DisplayName:     u.DisplayName,
				AvatarUpdatedAt: u.AvatarUpdatedAt,
			},
			MutualFriends:   mutual[u.ID],
			SharedLanguages: shared,
		})
	}

	// Most mutual friends first, then most shared languages, then name for a
	// stable order.
	sort.SliceStable(recs, func(i, j int) bool {
		if recs[i].MutualFriends != recs[j].MutualFriends {
			return recs[i].MutualFriends > recs[j].MutualFriends
		}
		if len(recs[i].SharedLanguages) != len(recs[j].SharedLanguages) {
			return len(recs[i].SharedLanguages) > len(recs[j].SharedLanguages)
		}
		return recs[i].User.DisplayName < recs[j].User.DisplayName
	})
	if len(recs) > limit {
		recs = recs[:limit]
	}
	return recs, nil
}

// Handler exposes the recommendation endpoint.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the recommendation routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/recommendations", h.List, authmw)
}

// List handles GET /recommendations?limit=.
func (h *Handler) List(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
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
	recs, err := h.svc.Recommend(c.Request().Context(), userID, limit)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"recommendations": recs})
}
