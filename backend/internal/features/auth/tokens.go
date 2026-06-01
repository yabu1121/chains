package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/cymed/chains/backend/internal/platform/cache"
)

// ErrInvalidRefresh is returned when a refresh token is unknown, expired, or
// has already been consumed (rotated). Callers should treat it as "log in again".
var ErrInvalidRefresh = errors.New("invalid refresh token")

const (
	refreshKeyPrefix = "auth:refresh:"
	revokedKeyPrefix = "auth:revoked:"
)

// TokenStore manages the server-side state for the auth token lifecycle on top
// of the shared cache: opaque refresh tokens (so they can be revoked/rotated)
// and an access-token jti denylist (so a specific access token can be killed
// before it expires).
type TokenStore struct {
	cache      cache.Cache
	refreshTTL time.Duration
}

// NewTokenStore builds a TokenStore. refreshTTL bounds how long a session can
// be kept alive without re-authenticating.
func NewTokenStore(c cache.Cache, refreshTTL time.Duration) *TokenStore {
	return &TokenStore{cache: c, refreshTTL: refreshTTL}
}

// hashToken returns the storage key for a refresh token. Only the hash is
// stored, so a cache dump never yields usable tokens.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return refreshKeyPrefix + hex.EncodeToString(sum[:])
}

// CreateRefresh mints a new opaque refresh token bound to userID and stores it
// with the configured TTL. The returned token is the only copy in plaintext.
func (s *TokenStore) CreateRefresh(ctx context.Context, userID uuid.UUID) (token string, exp time.Time, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", time.Time{}, fmt.Errorf("generate refresh token: %w", err)
	}
	token = base64.RawURLEncoding.EncodeToString(buf)
	if err := s.cache.Set(ctx, hashToken(token), []byte(userID.String()), s.refreshTTL); err != nil {
		return "", time.Time{}, fmt.Errorf("store refresh token: %w", err)
	}
	return token, time.Now().Add(s.refreshTTL), nil
}

// ConsumeRefresh validates a refresh token and deletes it (single-use
// rotation). A token that is missing — because it expired or was already used —
// yields ErrInvalidRefresh, which also surfaces refresh-token reuse.
func (s *TokenStore) ConsumeRefresh(ctx context.Context, token string) (uuid.UUID, error) {
	if token == "" {
		return uuid.Nil, ErrInvalidRefresh
	}
	key := hashToken(token)
	val, ok, err := s.cache.Get(ctx, key)
	if err != nil {
		return uuid.Nil, fmt.Errorf("load refresh token: %w", err)
	}
	if !ok {
		return uuid.Nil, ErrInvalidRefresh
	}
	// Rotate: the token is single-use.
	if err := s.cache.Delete(ctx, key); err != nil {
		return uuid.Nil, fmt.Errorf("delete refresh token: %w", err)
	}
	id, err := uuid.Parse(string(val))
	if err != nil {
		return uuid.Nil, ErrInvalidRefresh
	}
	return id, nil
}

// DeleteRefresh revokes a refresh token (logout). Missing tokens are ignored.
func (s *TokenStore) DeleteRefresh(ctx context.Context, token string) error {
	if token == "" {
		return nil
	}
	return s.cache.Delete(ctx, hashToken(token))
}

// RevokeAccess denylists an access token's jti until it would have expired, so
// a logged-out access token cannot be used during its remaining lifetime.
func (s *TokenStore) RevokeAccess(ctx context.Context, jti string, ttl time.Duration) error {
	if jti == "" || ttl <= 0 {
		return nil
	}
	return s.cache.Set(ctx, revokedKeyPrefix+jti, []byte{1}, ttl)
}

// IsAccessRevoked reports whether an access token's jti has been denylisted.
func (s *TokenStore) IsAccessRevoked(ctx context.Context, jti string) (bool, error) {
	if jti == "" {
		return false, nil
	}
	_, ok, err := s.cache.Get(ctx, revokedKeyPrefix+jti)
	return ok, err
}
