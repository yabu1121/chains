package config

import (
	"fmt"
	"os"
	"time"
)

// Config holds all runtime configuration, loaded from environment variables.
type Config struct {
	AppEnv      string
	HTTPAddr    string
	DatabaseURL string
	RedisAddr   string
	RedisDB     int
	JWTSecret   string
	JWTTTL      time.Duration // access-token lifetime (short-lived)
	RefreshTTL  time.Duration // refresh-token lifetime
	CORSOrigins []string
	CacheTTL    time.Duration

	// Auth cookie behaviour. CookieSecure marks the httpOnly auth cookies
	// Secure (HTTPS-only); defaults to true outside development. CookieDomain
	// optionally scopes them to a parent domain shared by the API and site.
	// CookieSameSite is "lax" (default) when the site and API share a
	// registrable domain, or "none" for cross-site setups (e.g. separate
	// *.run.app hosts); "none" forces Secure.
	CookieSecure   bool
	CookieDomain   string
	CookieSameSite string

	// TLS termination. When both are set the server listens with TLS directly;
	// otherwise it serves plain HTTP and TLS is expected to be terminated at an
	// upstream proxy / load balancer.
	TLSCertFile string
	TLSKeyFile  string

	// Database connection pool tuning.
	DBMaxOpenConns    int
	DBMaxIdleConns    int
	DBConnMaxLifetime time.Duration
	DBConnMaxIdleTime time.Duration

	// AutoMigrate runs schema migrations during API start-up. Defaults to true
	// in development for convenience and false otherwise, so production
	// migrations are a deliberate, separate step (cmd/migrate) that does not
	// race across rolling/horizontally-scaled instances.
	AutoMigrate bool

	// AvatarStorage selects where avatar image bytes are stored: "postgres"
	// (default, in the user_avatars table) or "fs" (a local directory standing
	// in for object storage). AvatarFSDir is the base directory when "fs".
	AvatarStorage string
	AvatarFSDir   string

	// RequireRedis makes Redis mandatory: the API fails to start if it cannot
	// connect, rather than falling back to a per-instance in-memory cache.
	// Defaults to true outside development, because with more than one instance
	// an in-memory cache cannot see cross-instance invalidations and serves
	// stale data. Set REQUIRE_REDIS=false for a single-instance deployment.
	RequireRedis bool

	// OAuth (GitHub, Google) social login. A provider is enabled only when both
	// its client id and secret are set; leaving them empty disables that button.
	//
	// OAuthRedirectBaseURL is this API's own public base URL (e.g.
	// https://api.example.com or http://localhost:8080 in dev). The provider
	// callback is built from it as <base>/api/auth/oauth/<provider>/callback —
	// that exact URL must be registered in the GitHub/Google OAuth app. It
	// defaults to the first CORS origin's scheme+host is NOT assumed; set it
	// explicitly to the API host.
	//
	// FrontendURL is where users are sent back to after a completed (or failed)
	// OAuth login; defaults to the first CORS origin.
	GithubOAuthClientID     string
	GithubOAuthClientSecret string
	GoogleOAuthClientID     string
	GoogleOAuthClientSecret string
	OAuthRedirectBaseURL    string
	FrontendURL             string
}

// minJWTSecretLen is the minimum acceptable HS256 secret length outside of
// development. 32 bytes matches the HS256 output size; shorter secrets weaken
// the signature against brute force.
const minJWTSecretLen = 32

// Load reads configuration from the environment, applying sane defaults for
// local development. It returns an error only for values that cannot have a
// safe default (the JWT secret outside of dev).
//
// APP_ENV defaults to "production" so that a deployment which simply forgot to
// set it fails closed — it will demand a real JWT_SECRET rather than silently
// booting with the insecure development default. Local development uses the
// devserver binary (which sets APP_ENV=development explicitly) or an explicit
// APP_ENV=development.
func Load() (*Config, error) {
	cfg := &Config{
		AppEnv:         env("APP_ENV", "production"),
		HTTPAddr:       env("HTTP_ADDR", defaultHTTPAddr()),
		DatabaseURL:    env("DATABASE_URL", "postgres://chains:chains@localhost:5432/chains?sslmode=disable"),
		RedisAddr:      env("REDIS_ADDR", "localhost:6379"),
		RedisDB:        envInt("REDIS_DB", 0),
		JWTSecret:      env("JWT_SECRET", ""),
		JWTTTL:         envDuration("JWT_TTL", 15*time.Minute),
		RefreshTTL:     envDuration("REFRESH_TTL", 30*24*time.Hour),
		CORSOrigins:    envList("CORS_ORIGINS", []string{"http://localhost:3000"}),
		CacheTTL:       envDuration("CACHE_TTL", 5*time.Minute),
		CookieDomain:   env("COOKIE_DOMAIN", ""),
		CookieSameSite: env("COOKIE_SAMESITE", "lax"),
		AvatarStorage:  env("AVATAR_STORAGE", "postgres"),
		AvatarFSDir:    env("AVATAR_FS_DIR", ""),
		TLSCertFile:    env("TLS_CERT_FILE", ""),
		TLSKeyFile:     env("TLS_KEY_FILE", ""),

		DBMaxOpenConns:    envInt("DB_MAX_OPEN_CONNS", 25),
		DBMaxIdleConns:    envInt("DB_MAX_IDLE_CONNS", 5),
		DBConnMaxLifetime: envDuration("DB_CONN_MAX_LIFETIME", time.Hour),
		DBConnMaxIdleTime: envDuration("DB_CONN_MAX_IDLE_TIME", 10*time.Minute),

		GithubOAuthClientID:     env("GITHUB_OAUTH_CLIENT_ID", ""),
		GithubOAuthClientSecret: env("GITHUB_OAUTH_CLIENT_SECRET", ""),
		GoogleOAuthClientID:     env("GOOGLE_OAUTH_CLIENT_ID", ""),
		GoogleOAuthClientSecret: env("GOOGLE_OAUTH_CLIENT_SECRET", ""),
		OAuthRedirectBaseURL:    env("OAUTH_REDIRECT_BASE_URL", "http://localhost:8080"),
		FrontendURL:             env("FRONTEND_URL", ""),
	}

	// FrontendURL defaults to the first configured CORS origin (the site that
	// talks to this API), which is almost always where we want to land users
	// after an OAuth round-trip.
	if cfg.FrontendURL == "" && len(cfg.CORSOrigins) > 0 {
		cfg.FrontendURL = cfg.CORSOrigins[0]
	}

	isDev := cfg.AppEnv == "development" || cfg.AppEnv == "test"
	if cfg.JWTSecret == "" {
		if isDev {
			cfg.JWTSecret = "dev-insecure-secret-change-me"
		} else {
			return nil, fmt.Errorf("JWT_SECRET must be set when APP_ENV=%q", cfg.AppEnv)
		}
	} else if !isDev && len(cfg.JWTSecret) < minJWTSecretLen {
		return nil, fmt.Errorf("JWT_SECRET must be at least %d bytes when APP_ENV=%q", minJWTSecretLen, cfg.AppEnv)
	}

	cfg.AutoMigrate = envBool("AUTO_MIGRATE", isDev)
	cfg.RequireRedis = envBool("REQUIRE_REDIS", !isDev)
	cfg.CookieSecure = envBool("COOKIE_SECURE", !isDev)

	return cfg, nil
}

// defaultHTTPAddr honours the PORT env var that container platforms (Cloud Run,
// Heroku, …) inject, falling back to :8080. An explicit HTTP_ADDR overrides it.
func defaultHTTPAddr() string {
	if p := os.Getenv("PORT"); p != "" {
		return ":" + p
	}
	return ":8080"
}

func envBool(key string, def bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		switch v {
		case "1", "true", "TRUE", "True", "yes", "on":
			return true
		case "0", "false", "FALSE", "False", "no", "off":
			return false
		}
	}
	return def
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			return n
		}
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func envList(key string, def []string) []string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		var out []string
		start := 0
		for i := 0; i <= len(v); i++ {
			if i == len(v) || v[i] == ',' {
				item := v[start:i]
				if item != "" {
					out = append(out, item)
				}
				start = i + 1
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return def
}
