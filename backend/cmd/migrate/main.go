// Command migrate applies all pending database migrations and exits. Running
// migrations as a discrete step (rather than on every API boot) keeps rolling
// deploys and horizontally-scaled instances from racing each other, and lets
// the schema change be gated/observed independently of the app rollout.
package main

import (
	"log"

	"github.com/cymed/chains/backend/internal/platform/config"
	"github.com/cymed/chains/backend/internal/platform/database"
)

func main() {
	if err := run(); err != nil {
		log.Fatalf("migrate: %v", err)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	db, err := database.Open(cfg.DatabaseURL, cfg.AppEnv == "development", database.PoolConfig{
		// Migrations need only a single connection.
		MaxOpenConns: 2,
		MaxIdleConns: 1,
	})
	if err != nil {
		return err
	}

	if err := database.Migrate(db); err != nil {
		return err
	}
	log.Printf("migrations applied")
	return nil
}
