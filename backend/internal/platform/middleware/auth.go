// Package middleware holds cross-cutting Echo middleware.
package middleware

import (
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/jwt"
)

const userIDKey = "userID"

// Auth verifies the Bearer token and stores the user ID in the context.
func Auth(jwtm *jwt.Manager) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			token, ok := bearer(header)
			if !ok {
				return httperr.Unauthorized("missing_token", "authorization bearer token required")
			}
			id, err := jwtm.Verify(token)
			if err != nil {
				return httperr.Unauthorized("invalid_token", "invalid or expired token").Wrap(err)
			}
			c.Set(userIDKey, id)
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

func bearer(header string) (string, bool) {
	const prefix = "Bearer "
	if len(header) > len(prefix) && strings.EqualFold(header[:len(prefix)], prefix) {
		return strings.TrimSpace(header[len(prefix):]), true
	}
	return "", false
}
