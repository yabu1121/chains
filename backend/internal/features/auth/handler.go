package auth

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

// Handler exposes the auth HTTP endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts the auth routes. authmw protects the routes that
// require a logged-in user.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.POST("/auth/register", h.Register)
	g.POST("/auth/login", h.Login)
	g.GET("/me", h.Me, authmw)
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
	resp, err := h.svc.Register(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, resp)
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
	resp, err := h.svc.Login(c.Request().Context(), req)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, resp)
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
