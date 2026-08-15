// Package jwt issues and verifies the stateless access tokens used for auth.
package jwt

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// Manager signs and verifies HS256 access tokens.
type Manager struct {
	secret []byte
	ttl    time.Duration
	issuer string
}

// NewManager builds a token manager.
func NewManager(secret string, ttl time.Duration) *Manager {
	return &Manager{secret: []byte(secret), ttl: ttl, issuer: "chains"}
}

// Claims is the token payload. Subject carries the user ID.
type Claims struct {
	jwt.RegisteredClaims
}

// Verified is the validated content of an access token.
type Verified struct {
	UserID    uuid.UUID
	ID        string // jti — unique per token, used for revocation
	ExpiresAt time.Time
}

// Issue creates a signed token for the given user. It returns the token, its
// jti (so the caller can revoke this specific token) and its expiry.
func (m *Manager) Issue(userID uuid.UUID) (token, jti string, exp time.Time, err error) {
	now := time.Now()
	exp = now.Add(m.ttl)
	jti = uuid.NewString()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			Subject:   userID.String(),
			Issuer:    m.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
	if err != nil {
		return "", "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, jti, exp, nil
}

// Verify parses and validates a token, returning its verified claims.
func (m *Manager) Verify(tokenStr string) (Verified, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		return m.secret, nil
	},
		// Pin the algorithm to HS256 so an attacker cannot downgrade to
		// "none" or coerce the HMAC secret to be verified as an RSA public key.
		jwt.WithValidMethods([]string{"HS256"}),
		// Reject tokens without an exp claim outright.
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(m.issuer),
	)
	if err != nil {
		return Verified{}, fmt.Errorf("parse token: %w", err)
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return Verified{}, fmt.Errorf("invalid subject: %w", err)
	}
	v := Verified{UserID: id, ID: claims.ID}
	if claims.ExpiresAt != nil {
		v.ExpiresAt = claims.ExpiresAt.Time
	}
	return v, nil
}
