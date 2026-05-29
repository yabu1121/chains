package cache

import (
	"context"
	"sync"
	"time"
)

type entry struct {
	value     []byte
	expiresAt time.Time
}

// Memory is an in-process Cache used for tests and as a no-Redis fallback.
type Memory struct {
	mu    sync.RWMutex
	items map[string]entry
}

// NewMemory builds an empty in-memory cache.
func NewMemory() *Memory {
	return &Memory{items: make(map[string]entry)}
}

func (m *Memory) Get(_ context.Context, key string) ([]byte, bool, error) {
	m.mu.RLock()
	e, ok := m.items[key]
	m.mu.RUnlock()
	if !ok {
		return nil, false, nil
	}
	if !e.expiresAt.IsZero() && time.Now().After(e.expiresAt) {
		m.mu.Lock()
		delete(m.items, key)
		m.mu.Unlock()
		return nil, false, nil
	}
	cp := make([]byte, len(e.value))
	copy(cp, e.value)
	return cp, true, nil
}

func (m *Memory) Set(_ context.Context, key string, value []byte, ttl time.Duration) error {
	var exp time.Time
	if ttl > 0 {
		exp = time.Now().Add(ttl)
	}
	cp := make([]byte, len(value))
	copy(cp, value)
	m.mu.Lock()
	m.items[key] = entry{value: cp, expiresAt: exp}
	m.mu.Unlock()
	return nil
}

func (m *Memory) Delete(_ context.Context, keys ...string) error {
	m.mu.Lock()
	for _, k := range keys {
		delete(m.items, k)
	}
	m.mu.Unlock()
	return nil
}

func (m *Memory) Close() error { return nil }
