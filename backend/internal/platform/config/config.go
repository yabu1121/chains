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
	JWTTTL      time.Duration
	CORSOrigins []string
	CacheTTL    time.Duration

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
		AppEnv:      env("APP_ENV", "production"),
		HTTPAddr:    env("HTTP_ADDR", ":8080"),
		DatabaseURL: env("DATABASE_URL", "postgres://chains:chains@localhost:5432/chains?sslmode=disable"),
		RedisAddr:   env("REDIS_ADDR", "localhost:6379"),
		RedisDB:     envInt("REDIS_DB", 0),
		JWTSecret:   env("JWT_SECRET", ""),
		JWTTTL:      envDuration("JWT_TTL", 24*time.Hour),
		CORSOrigins: envList("CORS_ORIGINS", []string{"http://localhost:3000"}),
		CacheTTL:    envDuration("CACHE_TTL", 5*time.Minute),
		TLSCertFile: env("TLS_CERT_FILE", ""),
		TLSKeyFile:  env("TLS_KEY_FILE", ""),

		DBMaxOpenConns:    envInt("DB_MAX_OPEN_CONNS", 25),
		DBMaxIdleConns:    envInt("DB_MAX_IDLE_CONNS", 5),
		DBConnMaxLifetime: envDuration("DB_CONN_MAX_LIFETIME", time.Hour),
		DBConnMaxIdleTime: envDuration("DB_CONN_MAX_IDLE_TIME", 10*time.Minute),
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

	return cfg, nil
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
