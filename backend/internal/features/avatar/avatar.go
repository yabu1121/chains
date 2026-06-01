// Package avatar stores and serves user profile images. The image bytes live
// behind a blobstore.Store (Postgres by default, filesystem/object storage when
// configured), while users.avatar_updated_at is kept in sync as a presence flag
// and cache-busting version. Serving requires authentication: the access token
// rides an httpOnly cookie, which <img> tags send automatically, so avatars are
// not exposed to anonymous callers.
package avatar

import (
	"context"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/features/network"
	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/blobstore"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/middleware"
)

// maxAvatarBytes caps the stored image size. maxUploadBytes adds a little slack
// so an oversized upload is rejected with a clear error rather than truncated.
const (
	maxAvatarBytes = 2 << 20 // 2 MiB
	maxUploadBytes = maxAvatarBytes + 1024
)

// allowedTypes are the content types we accept, detected by sniffing the bytes
// (not trusting the client's Content-Type header).
var allowedTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
	"image/gif":  true,
}

// Repository manages the users.avatar_updated_at flag (avatar presence +
// cache-busting version). The image bytes themselves live in a blobstore.Store,
// so where they are physically stored is swappable (Postgres, filesystem, or a
// future object store) without changing this slice.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// SetUpdatedAt stamps users.avatar_updated_at (avatar present + new version).
func (r *Repository) SetUpdatedAt(ctx context.Context, userID uuid.UUID, at time.Time) error {
	return r.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", userID).
		Update("avatar_updated_at", at).Error
}

// ClearUpdatedAt nulls users.avatar_updated_at (no avatar).
func (r *Repository) ClearUpdatedAt(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", userID).
		Update("avatar_updated_at", gorm.Expr("NULL")).Error
}

// Service holds avatar business logic.
type Service struct {
	store blobstore.Store
	meta  *Repository
	cache cache.Cache
}

// NewService builds a Service. store holds the image bytes; meta tracks the
// presence/version flag; cache may be nil.
func NewService(store blobstore.Store, meta *Repository, c cache.Cache) *Service {
	return &Service{store: store, meta: meta, cache: c}
}

// Get returns a user's avatar.
func (s *Service) Get(ctx context.Context, id uuid.UUID) (blobstore.Object, error) {
	obj, err := s.store.Get(ctx, id.String())
	if err != nil {
		if errors.Is(err, blobstore.ErrNotFound) {
			return blobstore.Object{}, httperr.NotFound("avatar_not_found", "no avatar")
		}
		return blobstore.Object{}, httperr.Internal("could not load avatar").Wrap(err)
	}
	return obj, nil
}

// Set validates and stores the caller's avatar, returning the sniffed content
// type and the new version timestamp.
func (s *Service) Set(ctx context.Context, userID uuid.UUID, data []byte) (string, time.Time, error) {
	if len(data) == 0 {
		return "", time.Time{}, httperr.BadRequest("invalid_image", "image is empty")
	}
	if len(data) > maxAvatarBytes {
		return "", time.Time{}, httperr.BadRequest("image_too_large", "image must be at most 2 MB")
	}
	ct := http.DetectContentType(data)
	if !allowedTypes[ct] {
		return "", time.Time{}, httperr.BadRequest("invalid_image", "unsupported image type (use PNG, JPEG, WebP or GIF)")
	}
	at := time.Now().UTC()
	// Store the bytes first, then flip the presence flag — so the flag is only
	// set once the image is actually retrievable (a failed flag update merely
	// orphans a blob, which is harmless and overwritten on the next upload).
	if err := s.store.Put(ctx, userID.String(), blobstore.Object{Data: data, ContentType: ct}); err != nil {
		return "", time.Time{}, httperr.Internal("could not save avatar").Wrap(err)
	}
	if err := s.meta.SetUpdatedAt(ctx, userID, at); err != nil {
		return "", time.Time{}, httperr.Internal("could not save avatar").Wrap(err)
	}
	s.invalidateNetwork(ctx)
	return ct, at, nil
}

// Delete removes the caller's avatar.
func (s *Service) Delete(ctx context.Context, userID uuid.UUID) error {
	// Clear the flag first so the avatar stops being shown even if the blob
	// delete fails (leaving at worst a harmless orphan blob).
	if err := s.meta.ClearUpdatedAt(ctx, userID); err != nil {
		return httperr.Internal("could not remove avatar").Wrap(err)
	}
	if err := s.store.Delete(ctx, userID.String()); err != nil {
		return httperr.Internal("could not remove avatar").Wrap(err)
	}
	s.invalidateNetwork(ctx)
	return nil
}

// invalidateNetwork drops the cached global graph so the avatar presence flag on
// each node reflects the change without waiting for the TTL.
func (s *Service) invalidateNetwork(ctx context.Context) {
	if s.cache != nil {
		_ = s.cache.Delete(ctx, network.GlobalCacheKey)
	}
}

// Handler exposes the avatar endpoints.
type Handler struct {
	svc *Service
}

// NewHandler builds a Handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// RegisterRoutes mounts avatar routes. All require auth — the access-token
// cookie is sent by <img> tags automatically, so reads are no longer public.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/users/:id/avatar", h.Get, authmw)
	g.PUT("/me/avatar", h.Put, authmw)
	g.DELETE("/me/avatar", h.Delete, authmw)
}

// Get handles GET /users/:id/avatar.
func (h *Handler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid user id")
	}
	obj, err := h.svc.Get(c.Request().Context(), id)
	if err != nil {
		return err
	}
	// Versioned via ?v=avatar_updated_at, but now auth-gated, so cache only in
	// the user's private browser cache (not shared/CDN caches).
	c.Response().Header().Set("Cache-Control", "private, max-age=3600")
	return c.Blob(http.StatusOK, obj.ContentType, obj.Data)
}

// Put handles PUT /me/avatar with the raw image as the request body.
func (h *Handler) Put(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	req := c.Request()
	req.Body = http.MaxBytesReader(c.Response(), req.Body, maxUploadBytes)
	data, err := io.ReadAll(req.Body)
	if err != nil {
		return httperr.BadRequest("image_too_large", "image must be at most 2 MB")
	}
	ct, at, err := h.svc.Set(req.Context(), userID, data)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, echo.Map{"content_type": ct, "avatar_updated_at": at})
}

// Delete handles DELETE /me/avatar.
func (h *Handler) Delete(c echo.Context) error {
	userID, err := middleware.MustUserID(c)
	if err != nil {
		return err
	}
	if err := h.svc.Delete(c.Request().Context(), userID); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
