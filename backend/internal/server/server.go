// Package server wires the feature slices into a single Echo instance. It is
// used both by cmd/api and by handler tests, so the routing is identical.
package server

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	emw "github.com/labstack/echo/v4/middleware"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/features/auth"
	"github.com/cymed/chains/backend/internal/features/avatar"
	"github.com/cymed/chains/backend/internal/features/friend"
	"github.com/cymed/chains/backend/internal/features/network"
	"github.com/cymed/chains/backend/internal/features/profile"
	"github.com/cymed/chains/backend/internal/features/user"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/config"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/jwt"
	"github.com/cymed/chains/backend/internal/platform/middleware"
	"github.com/cymed/chains/backend/internal/platform/validator"
)

// New builds a fully wired Echo server from its dependencies.
func New(cfg *config.Config, db *gorm.DB, c cache.Cache) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HTTPErrorHandler = httperr.Handler
	e.Validator = validator.New()

	e.Use(emw.Recover())
	e.Use(emw.RequestID())
	// Cap every request body so a single client cannot exhaust memory with an
	// unbounded upload. Set above the avatar upload ceiling (2 MiB) — the
	// avatar route additionally enforces its own, tighter MaxBytesReader.
	e.Use(emw.BodyLimit("4M"))
	// Baseline security response headers. This is a JSON API that should never
	// be framed or sniffed, so lock those down and ship a deny-all CSP. HSTS is
	// only meaningful once TLS is terminated, so enable it in production only.
	secure := emw.SecureConfig{
		ContentTypeNosniff:    "nosniff",
		XFrameOptions:         "DENY",
		ContentSecurityPolicy: "default-src 'none'; frame-ancestors 'none'",
		ReferrerPolicy:        "no-referrer",
	}
	if cfg.AppEnv == "production" {
		secure.HSTSMaxAge = 31536000 // 1 year
		secure.HSTSPreloadEnabled = true
	}
	e.Use(emw.SecureWithConfig(secure))
	e.Use(emw.RequestLoggerWithConfig(emw.RequestLoggerConfig{
		LogStatus:  true,
		LogMethod:  true,
		LogURI:     true,
		LogLatency: true,
		LogValuesFunc: func(_ echo.Context, v emw.RequestLoggerValues) error {
			slog.Info("request",
				"method", v.Method,
				"uri", v.URI,
				"status", v.Status,
				"latency", v.Latency.String(),
			)
			return nil
		},
	}))
	e.Use(emw.CORSWithConfig(emw.CORSConfig{
		AllowOrigins: cfg.CORSOrigins,
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAuthorization},
	}))

	jwtm := jwt.NewManager(cfg.JWTSecret, cfg.JWTTTL)
	authmw := middleware.Auth(jwtm)

	authSvc := auth.NewService(auth.NewRepository(db), jwtm, bcrypt.DefaultCost)
	friendSvc := friend.NewService(friend.NewRepository(db), friend.NewCache(c, cfg.CacheTTL))

	networkSvc := network.NewService(network.NewRepository(db), c)
	profileSvc := profile.NewService(profile.NewRepository(db), c)
	avatarSvc := avatar.NewService(avatar.NewRepository(db), c)

	authHandler := auth.NewHandler(authSvc)
	friendHandler := friend.NewHandler(friendSvc)
	userHandler := user.NewHandler(user.NewRepository(db))
	networkHandler := network.NewHandler(networkSvc)
	profileHandler := profile.NewHandler(profileSvc)
	avatarHandler := avatar.NewHandler(avatarSvc)

	e.GET("/health", health)

	api := e.Group("/api")
	api.GET("/health", health)
	auth.RegisterRoutes(api, authHandler, authmw)
	friend.RegisterRoutes(api, friendHandler, authmw)
	user.RegisterRoutes(api, userHandler, authmw)
	network.RegisterRoutes(api, networkHandler, authmw)
	profile.RegisterRoutes(api, profileHandler, authmw)
	avatar.RegisterRoutes(api, avatarHandler, authmw)

	return e
}

func health(c echo.Context) error {
	return c.JSON(http.StatusOK, echo.Map{"status": "ok", "time": time.Now().UTC()})
}
