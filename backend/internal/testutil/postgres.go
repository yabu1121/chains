// Package testutil provides shared test infrastructure: a real PostgreSQL via
// embedded-postgres (no Docker required) and a Redis via miniredis.
package testutil

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/platform/database"
)

// Postgres is a running embedded PostgreSQL instance with a migrated schema.
type Postgres struct {
	DB   *gorm.DB
	stop func() error
	dir  string
}

// StartPostgres downloads (first run only), starts and migrates an embedded
// PostgreSQL. Binaries are cached under a stable path to keep reruns fast.
func StartPostgres() (*Postgres, error) {
	port, err := freePort()
	if err != nil {
		return nil, err
	}

	dir, err := os.MkdirTemp("", "chains-pg-*")
	if err != nil {
		return nil, err
	}

	cache := filepath.Join(os.TempDir(), "chains-epg-cache")
	_ = os.MkdirAll(cache, 0o755)

	epg := embeddedpostgres.NewDatabase(
		embeddedpostgres.DefaultConfig().
			Port(uint32(port)).
			Database("chains").
			Username("chains").
			Password("chains").
			Locale("C").
			CachePath(cache).
			RuntimePath(filepath.Join(dir, "runtime")).
			DataPath(filepath.Join(dir, "data")).
			StartTimeout(60 * time.Second),
	)
	if err := epg.Start(); err != nil {
		_ = os.RemoveAll(dir)
		return nil, fmt.Errorf("start embedded postgres: %w", err)
	}

	dsn := fmt.Sprintf("postgres://chains:chains@localhost:%d/chains?sslmode=disable", port)
	db, err := database.Open(dsn, false)
	if err != nil {
		_ = epg.Stop()
		_ = os.RemoveAll(dir)
		return nil, err
	}
	if err := database.Migrate(db); err != nil {
		_ = epg.Stop()
		_ = os.RemoveAll(dir)
		return nil, err
	}

	return &Postgres{DB: db, stop: epg.Stop, dir: dir}, nil
}

// Stop shuts down the instance and removes its data directory.
func (p *Postgres) Stop() {
	if p == nil {
		return
	}
	if sqlDB, err := p.DB.DB(); err == nil {
		_ = sqlDB.Close()
	}
	_ = p.stop()
	_ = os.RemoveAll(p.dir)
}

// Truncate clears all data between tests while keeping the schema.
func (p *Postgres) Truncate() error {
	return p.DB.Exec("TRUNCATE TABLE blocks, friendships, users RESTART IDENTITY CASCADE").Error
}

func freePort() (int, error) {
	l, err := net.Listen("tcp", "localhost:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}
