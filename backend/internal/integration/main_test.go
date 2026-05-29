package integration

import (
	"fmt"
	"os"
	"testing"

	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/testutil"
)

// pg is the shared embedded PostgreSQL started once for this package. Tests
// call freshDB to get a truncated database.
var pg *testutil.Postgres

func TestMain(m *testing.M) {
	p, err := testutil.StartPostgres()
	if err != nil {
		fmt.Fprintf(os.Stderr, "could not start embedded postgres: %v\n", err)
		os.Exit(1)
	}
	pg = p
	code := m.Run()
	pg.Stop()
	os.Exit(code)
}

// freshDB returns the shared DB with all tables truncated.
func freshDB(t *testing.T) *gorm.DB {
	t.Helper()
	if err := pg.Truncate(); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return pg.DB
}
