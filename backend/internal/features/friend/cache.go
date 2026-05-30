package friend

import (
	"context"
	"strconv"
	"time"

	"github.com/google/uuid"

	"github.com/cymed/chains/backend/internal/features/network"
	"github.com/cymed/chains/backend/internal/platform/cache"
)

// Cache wraps the generic cache with friend-specific keys and a cache-aside
// helper for the friend list plus a counter for the pending-request badge.
type Cache struct {
	c   cache.Cache
	ttl time.Duration
}

// NewCache builds a friend cache with the given TTL.
func NewCache(c cache.Cache, ttl time.Duration) *Cache {
	if ttl <= 0 {
		ttl = 5 * time.Minute
	}
	return &Cache{c: c, ttl: ttl}
}

func friendsListKey(userID uuid.UUID) string {
	// v2: friend summaries now carry languages.
	return "friends:list:v2:" + userID.String()
}

func incomingCountKey(userID uuid.UUID) string {
	return "friends:reqcount:in:" + userID.String()
}


// GetFriendList returns the cached friend list, or ok=false on a miss.
func (fc *Cache) GetFriendList(ctx context.Context, userID uuid.UUID) ([]FriendSummary, bool) {
	if fc == nil {
		return nil, false
	}
	list, ok, err := cache.GetJSON[[]FriendSummary](ctx, fc.c, friendsListKey(userID))
	if err != nil || !ok {
		return nil, false
	}
	return list, true
}

// SetFriendList caches a freshly loaded friend list.
func (fc *Cache) SetFriendList(ctx context.Context, userID uuid.UUID, list []FriendSummary) {
	if fc == nil {
		return
	}
	_ = cache.SetJSON(ctx, fc.c, friendsListKey(userID), list, fc.ttl)
}

// GetIncomingCount returns the cached pending-incoming count, or ok=false.
func (fc *Cache) GetIncomingCount(ctx context.Context, userID uuid.UUID) (int64, bool) {
	if fc == nil {
		return 0, false
	}
	raw, ok, err := fc.c.Get(ctx, incomingCountKey(userID))
	if err != nil || !ok {
		return 0, false
	}
	n, err := strconv.ParseInt(string(raw), 10, 64)
	if err != nil {
		return 0, false
	}
	return n, true
}

// SetIncomingCount caches the pending-incoming count.
func (fc *Cache) SetIncomingCount(ctx context.Context, userID uuid.UUID, n int64) {
	if fc == nil {
		return
	}
	_ = fc.c.Set(ctx, incomingCountKey(userID), []byte(strconv.FormatInt(n, 10)), fc.ttl)
}

// InvalidatePair drops all cached entries that a relationship change between
// two users can affect. Over-invalidation here is intentionally cheap and safe.
func (fc *Cache) InvalidatePair(ctx context.Context, a, b uuid.UUID) {
	if fc == nil {
		return
	}
	_ = fc.c.Delete(ctx,
		friendsListKey(a), friendsListKey(b),
		incomingCountKey(a), incomingCountKey(b),
		network.GlobalCacheKey,
	)
}

// InvalidateUser drops one user's cached entries.
func (fc *Cache) InvalidateUser(ctx context.Context, userID uuid.UUID) {
	if fc == nil {
		return
	}
	_ = fc.c.Delete(ctx, friendsListKey(userID), incomingCountKey(userID))
}
