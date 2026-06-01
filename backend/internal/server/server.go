// Package server wires the feature slices into a single Echo instance. It is
// used both by cmd/api and by handler tests, so the routing is identical.
package server

import (
	"context"
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
	// A lenient global per-IP rate limit as a coarse abuse backstop.
	e.Use(emw.RateLimiterWithConfig(emw.RateLimiterConfig{
		Store: emw.NewRateLimiterMemoryStoreWithConfig(emw.RateLimiterMemoryStoreConfig{
			Rate: 50, Burst: 100, ExpiresIn: 3 * time.Minute,
		}),
		IdentifierExtractor: clientIP,
	}))
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
		// Cookies (httpOnly auth) must be sent on cross-origin requests; this
		// requires specific (non-"*") origins — set CORS_ORIGINS in production.
		AllowCredentials: true,
	}))

	jwtm := jwt.NewManager(cfg.JWTSecret, cfg.JWTTTL)

	refreshTTL := cfg.RefreshTTL
	if refreshTTL <= 0 {
		refreshTTL = 30 * 24 * time.Hour
	}
	tokenStore := auth.NewTokenStore(c, refreshTTL)
	authmw := middleware.Auth(jwtm, tokenStore)

	authSvc := auth.NewService(auth.NewRepository(db), jwtm, tokenStore, bcrypt.DefaultCost)
	friendSvc := friend.NewService(friend.NewRepository(db), friend.NewCache(c, cfg.CacheTTL))

	networkSvc := network.NewService(network.NewRepository(db), c)
	profileSvc := profile.NewService(profile.NewRepository(db), c)
	avatarSvc := avatar.NewService(avatar.NewRepository(db), c)

	authHandler := auth.NewHandler(authSvc, auth.CookieConfig{Secure: cfg.CookieSecure, Domain: cfg.CookieDomain})
	friendHandler := friend.NewHandler(friendSvc)
	userHandler := user.NewHandler(user.NewRepository(db))
	networkHandler := network.NewHandler(networkSvc)
	profileHandler := profile.NewHandler(profileSvc)
	avatarHandler := avatar.NewHandler(avatarSvc)

	// Liveness: the process is up and serving. Never touches dependencies, so
	// a slow/unreachable DB or Redis does not get the pod killed.
	e.GET("/health", health)
	e.GET("/livez", health)
	// Readiness: only route traffic here once dependencies are reachable.
	e.GET("/readyz", readiness(db, c))

	api := e.Group("/api")
	api.GET("/health", health)
	// Stricter per-IP limit on the unauthenticated credential endpoints to
	// blunt password brute-forcing / account enumeration. ~0.2 req/s sustained
	// with a burst of 10.
	credentialLimiter := emw.RateLimiterWithConfig(emw.RateLimiterConfig{
		Store: emw.NewRateLimiterMemoryStoreWithConfig(emw.RateLimiterMemoryStoreConfig{
			Rate: 0.2, Burst: 10, ExpiresIn: 5 * time.Minute,
		}),
		IdentifierExtractor: clientIP,
	})
	auth.RegisterRoutes(api, authHandler, authmw, credentialLimiter)
	friend.RegisterRoutes(api, friendHandler, authmw)
	user.RegisterRoutes(api, userHandler, authmw)
	network.RegisterRoutes(api, networkHandler, authmw)
	profile.RegisterRoutes(api, profileHandler, authmw)
	avatar.RegisterRoutes(api, avatarHandler, authmw)

	return e
}

// clientIP identifies a caller for rate limiting by their real IP (honouring
// X-Forwarded-For / X-Real-IP via Echo's trusted-proxy handling).
func clientIP(c echo.Context) (string, error) {
	return c.RealIP(), nil
}

func health(c echo.Context) error {
	return c.JSON(http.StatusOK, echo.Map{"status": "ok", "time": time.Now().UTC()})
}

// readiness pings the database and cache so an orchestrator only sends traffic
// once both are reachable. Returns 503 with a per-dependency breakdown when any
// check fails.
func readiness(db *gorm.DB, c cache.Cache) echo.HandlerFunc {
	return func(ctx echo.Context) error {
		rctx, cancel := context.WithTimeout(ctx.Request().Context(), 2*time.Second)
		defer cancel()

		checks := map[string]string{}
		ready := true

		if sqlDB, err := db.DB(); err != nil || sqlDB.PingContext(rctx) != nil {
			checks["database"] = "down"
			ready = false
		} else {
			checks["database"] = "ok"
		}

		if err := c.Ping(rctx); err != nil {
			checks["cache"] = "down"
			ready = false
		} else {
			checks["cache"] = "ok"
		}

		status := http.StatusOK
		state := "ready"
		if !ready {
			status = http.StatusServiceUnavailable
			state = "not_ready"
		}
		return ctx.JSON(status, echo.Map{"status": state, "checks": checks})
	}
}
