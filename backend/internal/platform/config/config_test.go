package config

import (
	"strings"
	"testing"
)

// clearConfigEnv removes every variable Load reads so each case starts clean.
func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{"APP_ENV", "HTTP_ADDR", "DATABASE_URL", "REDIS_ADDR", "REDIS_DB", "JWT_SECRET", "JWT_TTL", "CORS_ORIGINS", "CACHE_TTL"} {
		t.Setenv(k, "")
	}
}

func TestLoad_UnsetAppEnvDefaultsToProductionAndRequiresSecret(t *testing.T) {
	clearConfigEnv(t)
	// APP_ENV unset (empty) must NOT silently use the dev secret.
	_, err := Load()
	if err == nil {
		t.Fatal("expected Load to fail when APP_ENV is unset and JWT_SECRET is missing")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Fatalf("expected a JWT_SECRET error, got %v", err)
	}
}

func TestLoad_DevelopmentUsesInsecureDefault(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "development")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.JWTSecret == "" {
		t.Fatal("development should fall back to the dev secret")
	}
}

func TestLoad_ProductionRejectsShortSecret(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", "too-short")
	if _, err := Load(); err == nil {
		t.Fatal("expected a short production secret to be rejected")
	}
}

func TestLoad_ProductionAcceptsLongSecret(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_ENV", "production")
	t.Setenv("JWT_SECRET", strings.Repeat("x", minJWTSecretLen))
	cfg, err := Load()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.AppEnv != "production" {
		t.Fatalf("AppEnv = %q, want production", cfg.AppEnv)
	}
}
