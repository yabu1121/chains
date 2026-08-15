package friend

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/cymed/chains/backend/internal/testutil"
)

func TestCache_FriendListRoundTrip(t *testing.T) {
	fc := NewCache(testutil.NewRedis(t), time.Minute)
	ctx := context.Background()
	userID := uuid.New()

	_, ok := fc.GetFriendList(ctx, userID)
	require.False(t, ok, "expected a miss on an empty cache")

	want := []FriendSummary{
		{User: UserSummary{ID: uuid.New(), DisplayName: "Bob", Username: "bob"}, FriendsSince: time.Now().UTC().Truncate(time.Second)},
	}
	fc.SetFriendList(ctx, userID, want)

	got, ok := fc.GetFriendList(ctx, userID)
	require.True(t, ok)
	require.Len(t, got, 1)
	require.Equal(t, want[0].User.ID, got[0].User.ID)
	require.Equal(t, "Bob", got[0].User.DisplayName)
}

func TestCache_IncomingCountRoundTrip(t *testing.T) {
	fc := NewCache(testutil.NewRedis(t), time.Minute)
	ctx := context.Background()
	userID := uuid.New()

	_, ok := fc.GetIncomingCount(ctx, userID)
	require.False(t, ok)

	fc.SetIncomingCount(ctx, userID, 3)
	got, ok := fc.GetIncomingCount(ctx, userID)
	require.True(t, ok)
	require.Equal(t, int64(3), got)
}

func TestCache_InvalidatePairClearsBoth(t *testing.T) {
	fc := NewCache(testutil.NewRedis(t), time.Minute)
	ctx := context.Background()
	a, b := uuid.New(), uuid.New()

	fc.SetFriendList(ctx, a, []FriendSummary{})
	fc.SetFriendList(ctx, b, []FriendSummary{})
	fc.SetIncomingCount(ctx, a, 1)
	fc.SetIncomingCount(ctx, b, 2)

	fc.InvalidatePair(ctx, a, b)

	_, ok := fc.GetFriendList(ctx, a)
	require.False(t, ok)
	_, ok = fc.GetFriendList(ctx, b)
	require.False(t, ok)
	_, ok = fc.GetIncomingCount(ctx, a)
	require.False(t, ok)
	_, ok = fc.GetIncomingCount(ctx, b)
	require.False(t, ok)
}

func TestCache_NilSafe(t *testing.T) {
	var fc *Cache // a nil cache disables caching without panicking
	ctx := context.Background()
	id := uuid.New()

	require.NotPanics(t, func() {
		fc.SetFriendList(ctx, id, []FriendSummary{})
		_, ok := fc.GetFriendList(ctx, id)
		require.False(t, ok)
		fc.InvalidatePair(ctx, id, uuid.New())
		fc.InvalidateUser(ctx, id)
	})
}
