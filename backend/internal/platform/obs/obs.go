// Package obs is the seam for observability — error tracking and metrics —
// without binding the codebase to a specific vendor. The default reporter is a
// no-op; a real one (Sentry, Rollbar, an OTel exporter, …) is installed once at
// start-up via Set. Call sites depend only on this package, so swapping vendors
// never touches feature code.
package obs

import (
	"context"
	"sync/atomic"
)

// ErrorReporter receives server-side errors worth tracking (typically 5xx).
// attrs carries low-cardinality context (route, method, request id, …).
type ErrorReporter interface {
	ReportError(ctx context.Context, err error, attrs map[string]string)
}

type nopReporter struct{}

func (nopReporter) ReportError(context.Context, error, map[string]string) {}

// holder wraps the interface so the value stored in atomic.Value always has the
// same concrete type (atomic.Value panics on inconsistently typed stores).
type holder struct{ r ErrorReporter }

// reporter is held in an atomic.Value so Set during start-up and ReportError
// from request goroutines do not race.
var reporter atomic.Value // holder

func init() { reporter.Store(holder{r: nopReporter{}}) }

// Set installs the process-wide error reporter. A nil reporter is ignored.
// Intended to be called once during start-up.
func Set(r ErrorReporter) {
	if r != nil {
		reporter.Store(holder{r: r})
	}
}

// ReportError forwards an error to the installed reporter. Safe to call with a
// nil attrs map.
func ReportError(ctx context.Context, err error, attrs map[string]string) {
	if err == nil {
		return
	}
	reporter.Load().(holder).r.ReportError(ctx, err, attrs)
}
