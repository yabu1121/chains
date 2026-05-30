// Package avatar stores and serves user profile images. Bytes are kept in the
// user_avatars table (one row per user) and served via a public GET so plain
// <img> tags — which cannot send the Authorization header — can load them. The
// matching users.avatar_updated_at column is kept in sync as a presence flag
// and cache-busting version.
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
	"gorm.io/gorm/clause"

	"github.com/cymed/chains/backend/internal/features/network"
	"github.com/cymed/chains/backend/internal/models"
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

// Repository is the avatar slice's data access.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Get loads a user's avatar, or returns gorm.ErrRecordNotFound.
func (r *Repository) Get(ctx context.Context, userID uuid.UUID) (*models.UserAvatar, error) {
	var a models.UserAvatar
	if err := r.db.WithContext(ctx).First(&a, "user_id = ?", userID).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

// Upsert stores the avatar and stamps users.avatar_updated_at, atomically.
func (r *Repository) Upsert(ctx context.Context, userID uuid.UUID, data []byte, contentType string, at time.Time) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		av := &models.UserAvatar{UserID: userID, Data: data, ContentType: contentType, UpdatedAt: at}
		if err := tx.Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "user_id"}},
			DoUpdates: clause.AssignmentColumns([]string{"data", "content_type", "updated_at"}),
		}).Create(av).Error; err != nil {
			return err
		}
		return tx.Model(&models.User{}).Where("id = ?", userID).
			Update("avatar_updated_at", at).Error
	})
}

// Delete removes the avatar and clears users.avatar_updated_at, atomically.
func (r *Repository) Delete(ctx context.Context, userID uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&models.UserAvatar{}, "user_id = ?", userID).Error; err != nil {
			return err
		}
		return tx.Model(&models.User{}).Where("id = ?", userID).
			Update("avatar_updated_at", gorm.Expr("NULL")).Error
	})
}

// Service holds avatar business logic.
type Service struct {
	repo  *Repository
	cache cache.Cache
}

// NewService builds a Service. cache may be nil.
func NewService(repo *Repository, c cache.Cache) *Service {
	return &Service{repo: repo, cache: c}
}

// Get returns a user's avatar.
func (s *Service) Get(ctx context.Context, id uuid.UUID) (*models.UserAvatar, error) {
	a, err := s.repo.Get(ctx, id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("avatar_not_found", "no avatar")
		}
		return nil, httperr.Internal("could not load avatar").Wrap(err)
	}
	return a, nil
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
	if err := s.repo.Upsert(ctx, userID, data, ct, at); err != nil {
		return "", time.Time{}, httperr.Internal("could not save avatar").Wrap(err)
	}
	s.invalidateNetwork(ctx)
	return ct, at, nil
}

// Delete removes the caller's avatar.
func (s *Service) Delete(ctx context.Context, userID uuid.UUID) error {
	if err := s.repo.Delete(ctx, userID); err != nil {
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

// RegisterRoutes mounts avatar routes. GET is public (image tags cannot send the
// auth header); mutations require auth.
func RegisterRoutes(g *echo.Group, h *Handler, authmw echo.MiddlewareFunc) {
	g.GET("/users/:id/avatar", h.Get)
	g.PUT("/me/avatar", h.Put, authmw)
	g.DELETE("/me/avatar", h.Delete, authmw)
}

// Get handles GET /users/:id/avatar.
func (h *Handler) Get(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return httperr.BadRequest("invalid_id", "invalid user id")
	}
	a, err := h.svc.Get(c.Request().Context(), id)
	if err != nil {
		return err
	}
	// The URL is versioned with ?v=avatar_updated_at, so it is safe to cache.
	c.Response().Header().Set("Cache-Control", "public, max-age=3600")
	return c.Blob(http.StatusOK, a.ContentType, a.Data)
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
