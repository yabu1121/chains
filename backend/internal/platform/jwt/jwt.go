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

// Issue creates a signed token for the given user.
func (m *Manager) Issue(userID uuid.UUID) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(m.ttl)
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			Issuer:    m.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return signed, exp, nil
}

// Verify parses and validates a token, returning the subject user ID.
func (m *Manager) Verify(tokenStr string) (uuid.UUID, error) {
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
		return uuid.Nil, fmt.Errorf("parse token: %w", err)
	}
	id, err := uuid.Parse(claims.Subject)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid subject: %w", err)
	}
	return id, nil
}
