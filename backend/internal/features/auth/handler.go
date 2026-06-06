package auth

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
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

	// OAuth is optional: nil until EnableOAuth is called, in which case the
	// social-login routes are not registered. frontendURL is where the browser
	// is sent after an OAuth round-trip.
	oauth       *OAuthService
	frontendURL string
}

// NewHandler builds a Handler.
func NewHandler(svc *Service, cookie CookieConfig) *Handler {
	return &Handler{svc: svc, cookie: cookie}
}

// EnableOAuth wires social login into the handler. Called from server wiring
// when any OAuth provider is configured; returns the handler for chaining.
func (h *Handler) EnableOAuth(oauth *OAuthService, frontendURL string) *Handler {
	h.oauth = oauth
	h.frontendURL = frontendURL
	return h
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

	if h.oauth != nil {
		// Public: the browser is redirected here, so these are GET navigations,
		// not XHR. credentialMW (rate limiting) still applies as an abuse guard.
		g.GET("/auth/oauth/providers", h.OAuthProviders)
		g.GET("/auth/oauth/:provider/start", h.OAuthStart, credentialMW...)
		g.GET("/auth/oauth/:provider/callback", h.OAuthCallback, credentialMW...)
	}
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

// OAuthProviders handles GET /auth/oauth/providers, listing the enabled social
// login providers so the frontend knows which buttons to render.
func (h *Handler) OAuthProviders(c echo.Context) error {
	return c.JSON(http.StatusOK, echo.Map{"providers": h.oauth.EnabledProviders()})
}

// OAuthStart handles GET /auth/oauth/:provider/start, redirecting the browser
// to the provider's consent screen.
func (h *Handler) OAuthStart(c echo.Context) error {
	authURL, err := h.oauth.Start(c.Request().Context(), c.Param("provider"))
	if err != nil {
		return err
	}
	return c.Redirect(http.StatusFound, authURL)
}

// OAuthCallback handles GET /auth/oauth/:provider/callback. Because this is a
// top-level browser navigation (not XHR), it cannot return JSON: on success it
// sets the auth cookies and redirects to the app; on failure it redirects to
// the login page with a ?error code the frontend can surface.
func (h *Handler) OAuthCallback(c echo.Context) error {
	// The provider can report its own failure (e.g. the user denied consent).
	if provErr := c.QueryParam("error"); provErr != "" {
		return c.Redirect(http.StatusFound, h.frontendRedirect("/login", "oauth_"+provErr))
	}
	session, err := h.oauth.Complete(
		c.Request().Context(),
		c.Param("provider"),
		c.QueryParam("state"),
		c.QueryParam("code"),
	)
	if err != nil {
		code := "oauth_failed"
		var appErr *httperr.Error
		if errors.As(err, &appErr) {
			code = appErr.Code
		}
		return c.Redirect(http.StatusFound, h.frontendRedirect("/login", code))
	}
	h.setSessionCookies(c, session)
	return c.Redirect(http.StatusFound, h.frontendRedirect("/friends", ""))
}

// frontendRedirect builds an absolute URL back into the frontend, optionally
// carrying an ?error code.
func (h *Handler) frontendRedirect(path, errCode string) string {
	dest := strings.TrimRight(h.frontendURL, "/") + path
	if errCode != "" {
		dest += "?error=" + url.QueryEscape(errCode)
	}
	return dest
}

// setSessionCookies writes the access + refresh httpOnly cookies for a session.
func (h *Handler) setSessionCookies(c echo.Context, s *Session) {
	c.SetCookie(h.newCookie(middleware.AccessCookieName, s.AccessToken, "/", s.AccessExpires))
	c.SetCookie(h.newCookie(refreshCookieName, s.RefreshToken, refreshCookiePath, s.RefreshExpires))
}

// respondWithSession sets the access + refresh cookies and returns the public
// AuthResponse (access token in the body for non-browser clients; the refresh
// token is cookie-only).
func (h *Handler) respondWithSession(c echo.Context, status int, s *Session) error {
	h.setSessionCookies(c, s)
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
