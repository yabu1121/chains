// Command devserver runs the full API against a throwaway embedded PostgreSQL
// (no Docker or local Postgres install needed) so the app can be run locally
// with a single command. Redis is used if reachable, otherwise an in-memory
// cache is used. This is a development convenience, not for production.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"

	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/config"
	"github.com/cymed/chains/backend/internal/platform/database"
	"github.com/cymed/chains/backend/internal/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("devserver: %v", err)
	}
}

func run() error {
	addr := envOr("HTTP_ADDR", ":8080")

	pgPort, err := freePort()
	if err != nil {
		return err
	}
	dataDir, err := os.MkdirTemp("", "chains-devpg-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dataDir)

	epg := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			Port(uint32(pgPort)).
			Username("chains").Password("chains").Database("chains").
			Locale("C").
			CachePath(filepath.Join(os.TempDir(), "chains-epg-cache")).
			RuntimePath(filepath.Join(dataDir, "runtime")).
			DataPath(filepath.Join(dataDir, "data")).
			StartTimeout(60 * time.Second),
	)
	log.Printf("starting embedded postgres on port %d (first run downloads the binary)…", pgPort)
	if err := epg.Start(); err != nil {
		return fmt.Errorf("start embedded postgres: %w", err)
	}
	defer func() { _ = epg.Stop() }()

	dsn := fmt.Sprintf("postgres://chains:chains@localhost:%d/chains?sslmode=disable", pgPort)
	db, err := database.Open(dsn, true, database.PoolConfig{})
	if err != nil {
		return err
	}
	if err := database.Migrate(db); err != nil {
		return err
	}
	log.Printf("database ready and migrated")

	var c cache.Cache = cache.NewMemory()
	if rc, err := cache.NewRedis(envOr("REDIS_ADDR", "localhost:6379"), 0); err == nil {
		c = rc
		log.Printf("connected to redis")
	} else {
		log.Printf("redis unavailable (%v); using in-memory cache", err)
	}
	defer func() { _ = c.Close() }()

	cfg := &config.Config{
		AppEnv:      "development",
		HTTPAddr:    addr,
		JWTSecret:   envOr("JWT_SECRET", "dev-insecure-secret-change-me"),
		JWTTTL:      24 * time.Hour,
		CORSOrigins: []string{"http://localhost:3000"},
		CacheTTL:    5 * time.Minute,
	}
	e := server.New(cfg, db, c)
	srv := &http.Server{Addr: addr, Handler: e, ReadHeaderTimeout: 10 * time.Second}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("API listening on %s (embedded postgres)", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	select {
	case err := <-errCh:
		return err
	case <-stop:
	}

	log.Printf("shutting down…")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}
