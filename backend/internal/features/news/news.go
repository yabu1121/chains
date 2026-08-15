// Package news assembles a personalised technical-news feed. Rather than being a
// thin re-implementation of Qiita/Zenn/Hacker News, it ties the feed to chains'
// own data: articles are pulled for the languages a user has registered on their
// profile, so opening the News tab shows things they actually care about. Results
// are briefly cached in Redis because fetching from several upstreams per request
// would otherwise be slow and rate-limited.
package news

import (
	"context"
	"database/sql"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"golang.org/x/sync/errgroup"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/langs"
	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

const (
	// maxFeedLangs caps how many of a user's languages we expand into upstream
	// queries, so a user who lists 30 languages doesn't trigger 30×N fetches.
	maxFeedLangs = 5
	// maxArticles caps the assembled feed.
	maxArticles = 60
	// defaultTTL is how long an assembled feed is cached.
	defaultTTL = 15 * time.Minute
	// fetchBudget bounds the total time spent talking to upstreams per request.
	fetchBudget = 8 * time.Second
	// maxConcurrentFetches limits simultaneous upstream requests.
	maxConcurrentFetches = 6
)

// Article is one item in the feed.
type Article struct {
	Title       string    `json:"title"`
	URL         string    `json:"url"`
	Source      string    `json:"source"`
	Author      string    `json:"author,omitempty"`
	Summary     string    `json:"summary,omitempty"`
	Language    string    `json:"language,omitempty"`
	PublishedAt time.Time `json:"published_at"`
	// Reasons explain, in structured form, why this article is shown — rule-based,
	// no AI. The client localises them. Attached per-user (not cached).
	Reasons []Reason `json:"reasons,omitempty"`
}

// Reason is one explainable signal behind a recommendation. Kind is "language"
// (you registered it), "friends" (friends use it) or "saved" (you save articles
// in it). Language/Count carry the supporting detail.
type Reason struct {
	Kind     string `json:"kind"`
	Language string `json:"language,omitempty"`
	Count    int    `json:"count,omitempty"`
}

// FeedResponse is the payload for GET /news/feed.
type FeedResponse struct {
	// Languages echoes the languages the feed was built for (empty for a general
	// feed), so the client can show "for Go, TypeScript…".
	Languages []string  `json:"languages"`
	Articles  []Article `json:"articles"`
}

// Source fetches recent articles for a canonical language (or general tech when
// lang is ""). Implementations should honour ctx and may return a partial slice
// alongside an error; the aggregator simply skips a source that fails.
type Source interface {
	Name() string
	Fetch(ctx context.Context, lang string) ([]Article, error)
}

// Repository reads the caller's registered languages.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// LanguagesFor returns a user's languages in their chosen order.
func (r *Repository) LanguagesFor(ctx context.Context, userID uuid.UUID) ([]string, error) {
	var ls []string
	err := r.db.WithContext(ctx).
		Model(&models.UserLanguage{}).
		Where("user_id = ?", userID).
		Order("position ASC").
		Pluck("language", &ls).Error
	return ls, err
}

// langCount is a (lower-cased language, count) row used for reason signals.
type langCount struct {
	Language string
	N        int
}

// FriendLanguageCounts returns, per language, how many of the user's accepted
// friends list it (keyed by lower-cased language).
func (r *Repository) FriendLanguageCounts(ctx context.Context, userID uuid.UUID) (map[string]int, error) {
	var rows []langCount
	err := r.db.WithContext(ctx).Raw(
		`SELECT lower(ul.language) AS language, COUNT(DISTINCT ul.user_id) AS n
		 FROM user_languages ul
		 WHERE ul.user_id IN (
		     SELECT CASE WHEN requester_id = @u THEN addressee_id ELSE requester_id END
		     FROM friendships
		     WHERE status = 'accepted' AND (requester_id = @u OR addressee_id = @u)
		 )
		 GROUP BY lower(ul.language)`,
		sql.Named("u", userID)).Scan(&rows).Error
	return toCountMap(rows), err
}

// SavedLanguageCounts returns, per language, how many non-hidden articles the
// user has saved in it (keyed by lower-cased language).
func (r *Repository) SavedLanguageCounts(ctx context.Context, userID uuid.UUID) (map[string]int, error) {
	var rows []langCount
	err := r.db.WithContext(ctx).Raw(
		`SELECT lower(language) AS language, COUNT(*) AS n
		 FROM saved_articles
		 WHERE user_id = ? AND status <> 'hidden' AND language <> ''
		 GROUP BY lower(language)`,
		userID).Scan(&rows).Error
	return toCountMap(rows), err
}

func toCountMap(rows []langCount) map[string]int {
	out := make(map[string]int, len(rows))
	for _, r := range rows {
		out[r.Language] = r.N
	}
	return out
}

// Service assembles and caches the feed.
type Service struct {
	repo    *Repository
	cache   cache.Cache
	sources []Source
	ttl     time.Duration
}

// NewService builds a Service with the default upstream sources. cache may be nil
// to disable caching.
func NewService(repo *Repository, c cache.Cache) *Service {
	client := &http.Client{Timeout: 6 * time.Second}
	return &Service{
		repo:    repo,
		cache:   c,
		sources: DefaultSources(client),
		ttl:     defaultTTL,
	}
}

// newServiceWithSources is used by tests to inject fake sources.
func newServiceWithSources(repo *Repository, c cache.Cache, sources []Source) *Service {
	return &Service{repo: repo, cache: c, sources: sources, ttl: defaultTTL}
}

// FeedFor builds the feed for a user, preferring an explicit language filter and
// otherwise falling back to the languages on their profile.
func (s *Service) FeedFor(ctx context.Context, userID uuid.UUID, lang string) (*FeedResponse, error) {
	var requested []string
	if lang != "" {
		canonical, ok := langs.Canonical(lang)
		if !ok {
			return nil, httperr.BadRequest("unknown_language", "unknown language: "+lang)
		}
		requested = []string{canonical}
	} else {
		stored, err := s.repo.LanguagesFor(ctx, userID)
		if err != nil {
			return nil, httperr.Internal("could not load languages").Wrap(err)
		}
		requested = stored
	}
	resp, err := s.feed(ctx, requested)
	if err != nil {
		return nil, err
	}
	// Attach per-user "why you're seeing this" reasons. Best-effort: the cached
	// feed is shared, but cache.GetJSON hands back a fresh copy per call, so it is
	// safe to annotate here. The repo is nil in unit tests that inject sources.
	if s.repo != nil {
		s.attachReasons(ctx, userID, resp)
	}
	return resp, nil
}

// reasonSignals is the per-user data the reason rules need. It is cached briefly
// so the three aggregate queries don't run on every (often cache-served) feed.
type reasonSignals struct {
	Languages    []string       `json:"languages"`
	FriendCounts map[string]int `json:"friend_counts"`
	SavedCounts  map[string]int `json:"saved_counts"`
}

// reasonsTTL is how long the per-user reason signals are cached.
const reasonsTTL = 10 * time.Minute

// loadSignals returns the user's reason signals, served from a short per-user
// cache when warm (reasons tolerate a few minutes of staleness).
func (s *Service) loadSignals(ctx context.Context, userID uuid.UUID) reasonSignals {
	key := "news:reasons:v1:" + userID.String()
	if s.cache != nil {
		if cached, ok, err := cache.GetJSON[reasonSignals](ctx, s.cache, key); err == nil && ok {
			return cached
		}
	}
	langs, err := s.repo.LanguagesFor(ctx, userID)
	if err != nil {
		slog.Warn("news reasons: languages", "error", err)
	}
	friendCounts, err := s.repo.FriendLanguageCounts(ctx, userID)
	if err != nil {
		slog.Warn("news reasons: friend languages", "error", err)
	}
	savedCounts, err := s.repo.SavedLanguageCounts(ctx, userID)
	if err != nil {
		slog.Warn("news reasons: saved languages", "error", err)
	}
	sig := reasonSignals{Languages: langs, FriendCounts: friendCounts, SavedCounts: savedCounts}
	if s.cache != nil {
		_ = cache.SetJSON(ctx, s.cache, key, sig, reasonsTTL)
	}
	return sig
}

// attachReasons annotates each article with the rule-based signals that justify
// it for this user: a registered language, friends who use it, or a history of
// saving articles in it.
func (s *Service) attachReasons(ctx context.Context, userID uuid.UUID, resp *FeedResponse) {
	sig := s.loadSignals(ctx, userID)
	mine := make(map[string]struct{}, len(sig.Languages))
	for _, l := range sig.Languages {
		mine[strings.ToLower(l)] = struct{}{}
	}

	for i := range resp.Articles {
		a := &resp.Articles[i]
		if a.Language == "" {
			continue
		}
		l := strings.ToLower(a.Language)
		var reasons []Reason
		if _, ok := mine[l]; ok {
			reasons = append(reasons, Reason{Kind: "language", Language: a.Language})
		}
		if n := sig.FriendCounts[l]; n > 0 {
			reasons = append(reasons, Reason{Kind: "friends", Language: a.Language, Count: n})
		}
		if n := sig.SavedCounts[l]; n > 0 {
			reasons = append(reasons, Reason{Kind: "saved", Language: a.Language, Count: n})
		}
		a.Reasons = reasons
	}
}

// feed assembles (or serves from cache) the feed for the given languages.
func (s *Service) feed(ctx context.Context, requested []string) (*FeedResponse, error) {
	feedLangs := normaliseLangs(requested)

	key := cacheKey(feedLangs)
	if s.cache != nil {
		if cached, ok, err := cache.GetJSON[FeedResponse](ctx, s.cache, key); err == nil && ok {
			return &cached, nil
		}
	}

	articles := s.gather(ctx, feedLangs)
	resp := &FeedResponse{Languages: feedLangs, Articles: articles}

	if s.cache != nil {
		_ = cache.SetJSON(ctx, s.cache, key, resp, s.ttl)
	}
	return resp, nil
}

// gather fans out across (language × source), deduplicates by URL and returns the
// most recent articles first. A general feed (no languages) queries each source
// once with an empty language.
func (s *Service) gather(ctx context.Context, feedLangs []string) []Article {
	ctx, cancel := context.WithTimeout(ctx, fetchBudget)
	defer cancel()

	queries := feedLangs
	if len(queries) == 0 {
		queries = []string{""}
	}

	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(maxConcurrentFetches)

	var (
		mu  sync.Mutex
		all []Article
	)
	for _, lang := range queries {
		for _, src := range s.sources {
			lang, src := lang, src
			g.Go(func() error {
				got, err := src.Fetch(gctx, lang)
				if err != nil {
					// A failing upstream must not sink the whole feed; skip it.
					slog.Warn("news source failed", "source", src.Name(), "lang", lang, "error", err)
					return nil
				}
				for i := range got {
					if lang != "" && got[i].Language == "" {
						got[i].Language = lang
					}
				}
				mu.Lock()
				all = append(all, got...)
				mu.Unlock()
				return nil
			})
		}
	}
	_ = g.Wait() // individual errors are swallowed above; Wait only sees nil

	return rank(all)
}

// rank deduplicates by URL (keeping the first seen) and orders by recency.
func rank(in []Article) []Article {
	seen := make(map[string]struct{}, len(in))
	out := make([]Article, 0, len(in))
	for _, a := range in {
		if a.Title == "" || a.URL == "" {
			continue
		}
		if _, dup := seen[a.URL]; dup {
			continue
		}
		seen[a.URL] = struct{}{}
		out = append(out, a)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].PublishedAt.After(out[j].PublishedAt)
	})
	if len(out) > maxArticles {
		out = out[:maxArticles]
	}
	return out
}

// normaliseLangs canonicalises, de-duplicates and caps the requested languages,
// preserving order. Unknown languages are dropped (stored languages are already
// canonical; this mainly guards odd input).
func normaliseLangs(in []string) []string {
	out := make([]string, 0, len(in))
	seen := make(map[string]struct{}, len(in))
	for _, raw := range in {
		c, ok := langs.Canonical(raw)
		if !ok {
			continue
		}
		if _, dup := seen[c]; dup {
			continue
		}
		seen[c] = struct{}{}
		out = append(out, c)
		if len(out) >= maxFeedLangs {
			break
		}
	}
	return out
}

// cacheKey is stable for a given set of languages regardless of order.
func cacheKey(feedLangs []string) string {
	if len(feedLangs) == 0 {
		return "news:feed:v1:general"
	}
	sorted := append([]string(nil), feedLangs...)
	sort.Strings(sorted)
	return "news:feed:v1:" + strings.ToLower(strings.Join(sorted, ","))
}

// Handler exposes the news endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the news routes behind auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/news/feed", h.Feed, authmw)
}

// Feed handles GET /news/feed?lang=.
func (h *Handler) Feed(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	lang := strings.TrimSpace(c.QueryParam("lang"))
	resp, err := h.svc.FeedFor(c.Request().Context(), userID, lang)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, resp)
}
