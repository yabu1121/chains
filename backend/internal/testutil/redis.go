package testutil

import (
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"github.com/cymed/chains/backend/internal/platform/cache"
)

// NewRedis starts an in-process miniredis and returns a Cache backed by it.
// The server is closed automatically when the test finishes.
func NewRedis(t testing.TB) cache.Cache {
	t.Helper()
	mr := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	return cache.NewRedisFromClient(client)
}
