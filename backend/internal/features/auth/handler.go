package auth

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

// refreshCookieName is the httpOnly cookie carrying the opaque refresh token.
// Its path is scoped so it is only sent to the refresh/logout endpoints.
const (
	refreshCookieName = "refresh_token"
	refreshCookiePath = "/api/auth"
)

// CookieConfig controls how auth cookies are emitted. Secure should be true in
// production (HTTPS). SameSite is Lax when the site and API share a registrable
// domain (with a restricted CORS origin as the CSRF defence), or None for
// cross-site hosting (e.g. separate *.run.app hosts) — which the browser only
// honours together with Secure.
type CookieConfig struct {
	Secure   bool
	Domain   string
	SameSite http.SameSite
}

// Handler exposes the auth HTTP endpoints.
type Handler struct {
	svc    *Service
	cookie CookieConfig
}

// NewHandler builds a Handler.
func NewHandler(svc *Service, cookie CookieConfig) *Handler {
	return &Handler{svc: svc, cookie: cookie}
}

// RegisterRoutes mounts the auth routes. authmw protects the routes that
// require a logged-in user. credentialMW (e.g. a rate limiter) is applied to
// the unauthenticated credential endpoints to slow brute-force attempts.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc, credentialMW ...echo.MiddlewareFunc) {
	g.POST("/auth/register", h.Register, credentialMW...)
	g.POST("/auth/login", h.Login, credentialMW...)
	g.POST("/auth/refresh", h.Refresh, credentialMW...)
	g.POST("/auth/logout", h.Logout, authmw)
	g.GET("/me", h.Me, authmw)
	g.DELETE("/me", h.DeleteAccount, authmw)
}

// Register handles POST /auth/register.
func (h *Handler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	session, err := h.svc.Register(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return h.respondWithSession(c, http.StatusCreated, session)
}

// Login handles POST /auth/login.
func (h *Handler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	session, err := h.svc.Login(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return h.respondWithSession(c, http.StatusOK, session)
}

// Refresh handles POST /auth/refresh, rotating the refresh cookie and issuing a
// fresh access token.
func (h *Handler) Refresh(c echo.Context) error {
	refresh := readCookie(c, refreshCookieName)
	session, err := h.svc.Refresh(c.Request().Context(), refresh)
	if err != nil {
		// On a bad refresh token, proactively clear the cookies.
		h.clearAuthCookies(c)
		return err
	}
	return h.respondWithSession(c, http.StatusOK, session)
}

// Logout handles POST /auth/logout, revoking the refresh token and the current
// access token, then clearing the cookies.
func (h *Handler) Logout(c echo.Context) error {
	jti, exp := middleware.AccessToken(c)
	refresh := readCookie(c, refreshCookieName)
	if err := h.svc.Logout(c.Request().Context(), refresh, jti, exp); err != nil {
		return err
	}
	h.clearAuthCookies(c)
	return c.NoContent(http.StatusNoContent)
}

// DeleteAccount handles DELETE /me: permanently erases the caller's account
// after re-confirming their password, then clears the auth cookies.
func (h *Handler) DeleteAccount(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var req DeleteAccountRequest
	if err := c.Bind(&req); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := c.Validate(&req); err != nil {
		return err
	}
	jti, exp := middleware.AccessToken(c)
	refresh := readCookie(c, refreshCookieName)
	if err := h.svc.DeleteAccount(c.Request().Context(), userID, req.Password, refresh, jti, exp); err != nil {
		return err
	}
	h.clearAuthCookies(c)
	return c.NoContent(http.StatusNoContent)
}

// Me handles GET /me.
func (h *Handler) Me(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	resp, err := h.svc.Me(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, resp)
}

// respondWithSession sets the access + refresh cookies and returns the public
// AuthResponse (access token in the body for non-browser clients; the refresh
// token is cookie-only).
func (h *Handler) respondWithSession(c echo.Context, status int, s *Session) error {
	c.SetCookie(h.newCookie(middleware.AccessCookieName, s.AccessToken, "/", s.AccessExpires))
	c.SetCookie(h.newCookie(refreshCookieName, s.RefreshToken, refreshCookiePath, s.RefreshExpires))
	return c.JSON(status, AuthResponse{
		Token:     s.AccessToken,
		ExpiresAt: s.AccessExpires,
		User:      s.User,
	})
}

func (h *Handler) clearAuthCookies(c echo.Context) {
	past := time.Unix(0, 0)
	c.SetCookie(h.newCookie(middleware.AccessCookieName, "", "/", past))
	c.SetCookie(h.newCookie(refreshCookieName, "", refreshCookiePath, past))
}

// newCookie builds an httpOnly auth cookie. An expiry in the past deletes it.
func (h *Handler) newCookie(name, value, path string, expires time.Time) *http.Cookie {
	sameSite := h.cookie.SameSite
	if sameSite == 0 {
		sameSite = http.SameSiteLaxMode
	}
	secure := h.cookie.Secure
	// Browsers reject SameSite=None cookies that are not also Secure.
	if sameSite == http.SameSiteNoneMode {
		secure = true
	}
	return &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     path,
		Domain:   h.cookie.Domain,
		Expires:  expires,
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
	}
}

func readCookie(c echo.Context, name string) string {
	ck, err := c.Cookie(name)
	if err != nil || ck == nil {
		return ""
	}
	return ck.Value
}
