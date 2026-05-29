// Package migrations embeds the versioned SQL migration files so they ship
// inside the binary and stay in sync between application start-up and tests.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
