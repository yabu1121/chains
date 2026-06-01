// Command api is the Chains backend HTTP server.
package main

import (
	"context"
	"errors"
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

	db, err := database.Open(cfg.DatabaseURL, cfg.AppEnv == "development")
	if err != nil {
		return err
	}
	if err := database.Migrate(db); err != nil {
		return err
	}
	log.Printf("database connected and migrated")

	var c cache.Cache
	if rc, err := cache.NewRedis(cfg.RedisAddr, cfg.RedisDB); err != nil {
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
