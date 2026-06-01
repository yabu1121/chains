// Package cache defines a small key/value cache abstraction (cache-aside) with
// a Redis implementation for production and an in-memory implementation for
// tests and local fallback.
package cache

import (
	"context"
	"encoding/json"
	"time"
)

// Cache is the minimal surface feature slices depend on.
type Cache interface {
	Get(ctx context.Context, key string) ([]byte, bool, error)
	Set(ctx context.Context, key string, value []byte, ttl time.Duration) error
	Delete(ctx context.Context, keys ...string) error
	// Ping reports whether the backing store is reachable, for readiness checks.
	Ping(ctx context.Context) error
	Close() error
}

// GetJSON reads and unmarshals a cached value. The bool is false on a miss.
func GetJSON[T any](ctx context.Context, c Cache, key string) (T, bool, error) {
	var out T
	raw, ok, err := c.Get(ctx, key)
	if err != nil || !ok {
		return out, false, err
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return out, false, err
	}
	return out, true, nil
}

// SetJSON marshals and stores a value with a TTL.
func SetJSON(ctx context.Context, c Cache, key string, value any, ttl time.Duration) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return c.Set(ctx, key, raw, ttl)
}
