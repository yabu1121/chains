// Package middleware holds cross-cutting Echo middleware.
package middleware

import (
	"context"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/jwt"
)

// AccessCookieName is the httpOnly cookie carrying the access token. Exported
// so the auth handler sets the same name the middleware reads.
const AccessCookieName = "access_token"

const (
	userIDKey    = "userID"
	accessJTIKey = "accessJTI"
	accessExpKey = "accessExp"
)

// AccessRevoker reports whether an access token (by jti) has been revoked.
// Satisfied by the auth TokenStore; may be nil to skip the check.
type AccessRevoker interface {
	IsAccessRevoked(ctx context.Context, jti string) (bool, error)
}

// Auth verifies the access token (from the httpOnly cookie, falling back to a
// Bearer header for non-browser clients), rejects revoked tokens, and stores
// the user ID and token claims in the context.
func Auth(jwtm *jwt.Manager, revoker AccessRevoker) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			token, ok := accessToken(c)
			if !ok {
				return httperr.Unauthorized("missing_token", "authentication required")
			}
			claims, err := jwtm.Verify(token)
			if err != nil {
				return httperr.Unauthorized("invalid_token", "invalid or expired token").Wrap(err)
			}
			if revoker != nil {
				revoked, err := revoker.IsAccessRevoked(c.Request().Context(), claims.ID)
				if err != nil {
					return httperr.Internal("could not check token status").Wrap(err)
				}
				if revoked {
					return httperr.Unauthorized("invalid_token", "token has been revoked")
				}
			}
			c.Set(userIDKey, claims.UserID)
			c.Set(accessJTIKey, claims.ID)
			c.Set(accessExpKey, claims.ExpiresAt)
			return next(c)
		}
	}
}

// UserID returns the authenticated user ID set by Auth. The bool is false when
// the request is unauthenticated.
func UserID(c echo.Context) (uuid.UUID, bool) {
	v, ok := c.Get(userIDKey).(uuid.UUID)
	return v, ok
}

// MustUserID returns the authenticated user ID, or an internal error if the
// route was not wrapped by Auth (a programming mistake).
func MustUserID(c echo.Context) (uuid.UUID, error) {
	id, ok := UserID(c)
	if !ok {
		return uuid.Nil, httperr.Internal("authenticated user missing from context")
	}
	return id, nil
}

// AccessToken returns the current access token's jti and expiry as set by Auth,
// so handlers (e.g. logout) can revoke it. Zero values when unauthenticated.
func AccessToken(c echo.Context) (jti string, exp time.Time) {
	jti, _ = c.Get(accessJTIKey).(string)
	exp, _ = c.Get(accessExpKey).(time.Time)
	return jti, exp
}

// accessToken pulls the token from the access cookie, falling back to an
// "Authorization: Bearer <token>" header.
func accessToken(c echo.Context) (string, bool) {
	if ck, err := c.Cookie(AccessCookieName); err == nil && ck != nil && ck.Value != "" {
		return ck.Value, true
	}
	return bearer(c.Request().Header.Get("Authorization"))
}

func bearer(header string) (string, bool) {
	const prefix = "Bearer "
	if len(header) > len(prefix) && strings.EqualFold(header[:len(prefix)], prefix) {
		return strings.TrimSpace(header[len(prefix):]), true
	}
	return "", false
}
