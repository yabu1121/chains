// Command api is the Chains backend HTTP server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/config"
	"github.com/cymed/chains/backend/internal/platform/database"
	"github.com/cymed/chains/backend/internal/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	db, err := database.Open(cfg.DatabaseURL, cfg.AppEnv == "development", database.PoolConfig{
		MaxOpenConns:    cfg.DBMaxOpenConns,
		MaxIdleConns:    cfg.DBMaxIdleConns,
		ConnMaxLifetime: cfg.DBConnMaxLifetime,
		ConnMaxIdleTime: cfg.DBConnMaxIdleTime,
	})
	if err != nil {
		return err
	}
	if cfg.AutoMigrate {
		if err := database.Migrate(db); err != nil {
			return err
		}
		log.Printf("database connected and migrated")
	} else {
		log.Printf("database connected (AUTO_MIGRATE off; run cmd/migrate to apply migrations)")
	}

	var c cache.Cache
	if rc, err := cache.NewRedis(cfg.RedisAddr, cfg.RedisDB); err != nil {
		if cfg.RequireRedis {
			// Falling back to a per-instance memory cache here would silently
			// break cross-instance invalidation once scaled out.
			return fmt.Errorf("redis required but unavailable at %s: %w", cfg.RedisAddr, err)
		}
		log.Printf("warning: redis unavailable (%v); using in-memory cache", err)
		c = cache.NewMemory()
	} else {
		c = rc
		log.Printf("redis connected at %s", cfg.RedisAddr)
	}
	defer func() { _ = c.Close() }()

	e := server.New(cfg, db, c)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           e,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20, // 1 MiB
	}

	tlsEnabled := cfg.TLSCertFile != "" && cfg.TLSKeyFile != ""
	go func() {
		log.Printf("listening on %s (tls=%t)", cfg.HTTPAddr, tlsEnabled)
		var err error
		if tlsEnabled {
			err = srv.ListenAndServeTLS(cfg.TLSCertFile, cfg.TLSKeyFile)
		} else {
			// TLS is expected to be terminated upstream when not configured here.
			err = srv.ListenAndServe()
		}
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Printf("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}
