package friend

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

// Handler exposes the friend HTTP endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts all friend routes behind the auth middleware.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.POST("/friends/requests", h.SendRequest, authmw)
	g.GET("/friends/requests/incoming", h.ListIncoming, authmw)
	g.GET("/friends/requests/incoming/count", h.IncomingCount, authmw)
	g.GET("/friends/requests/outgoing", h.ListOutgoing, authmw)
	g.POST("/friends/requests/:id/accept", h.Accept, authmw)
	g.DELETE("/friends/requests/:id", h.Reject, authmw)

	g.GET("/friends", h.ListFriends, authmw)
	g.DELETE("/friends/:userId", h.RemoveFriend, authmw)

	g.POST("/blocks", h.Block, authmw)
	g.DELETE("/blocks/:userId", h.Unblock, authmw)
	g.GET("/blocks", h.ListBlocked, authmw)
}

// SendRequest handles POST /friends/requests.
func (h *Handler) SendRequest(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var in SendRequestInput
	if err := c.Bind(&in); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := c.Validate(&in); err != nil {
		return err
	}
	resp, err := h.svc.SendRequest(c.Request().Context(), userID, in.AddresseeID, in.Message)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusCreated, resp)
}

// Accept handles POST /friends/requests/:id/accept.
func (h *Handler) Accept(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := pathUUID(c, "id")
	if err != nil {
		return err
	}
	if err := h.svc.AcceptRequest(c.Request().Context(), userID, id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Reject handles DELETE /friends/requests/:id (decline or cancel).
func (h *Handler) Reject(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	id, err := pathUUID(c, "id")
	if err != nil {
		return err
	}
	if err := h.svc.RejectRequest(c.Request().Context(), userID, id); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// ListFriends handles GET /friends.
func (h *Handler) ListFriends(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.ListFriends(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"friends": list})
}

// ListIncoming handles GET /friends/requests/incoming.
func (h *Handler) ListIncoming(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.ListIncomingRequests(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"requests": list})
}

// ListOutgoing handles GET /friends/requests/outgoing.
func (h *Handler) ListOutgoing(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.ListOutgoingRequests(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"requests": list})
}

// IncomingCount handles GET /friends/requests/incoming/count.
func (h *Handler) IncomingCount(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	n, err := h.svc.IncomingRequestCount(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"count": n})
}

// RemoveFriend handles DELETE /friends/:userId.
func (h *Handler) RemoveFriend(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	otherID, err := pathUUID(c, "userId")
	if err != nil {
		return err
	}
	if err := h.svc.RemoveFriend(c.Request().Context(), userID, otherID); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Block handles POST /blocks.
func (h *Handler) Block(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	var in BlockInput
	if err := c.Bind(&in); err != nil {
		return httperr.BadRequest("invalid_body", "request body is not valid JSON")
	}
	if err := c.Validate(&in); err != nil {
		return err
	}
	if err := h.svc.Block(c.Request().Context(), userID, in.UserID); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// Unblock handles DELETE /blocks/:userId.
func (h *Handler) Unblock(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	otherID, err := pathUUID(c, "userId")
	if err != nil {
		return err
	}
	if err := h.svc.Unblock(c.Request().Context(), userID, otherID); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}

// ListBlocked handles GET /blocks.
func (h *Handler) ListBlocked(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	list, err := h.svc.ListBlocked(c.Request().Context(), userID)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"blocked": list})
}

func pathUUID(c echo.Context, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Param(name))
	if err != nil {
		return uuid.Nil, httperr.BadRequest("invalid_id", "invalid "+name)
	}
	return id, nil
}
