package httperr

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"

	"github.com/cymed/chains/backend/internal/platform/obs"
)

type recordingReporter struct{ count int }

func (r *recordingReporter) ReportError(context.Context, error, map[string]string) { r.count++ }

func TestHandler_Logs5xxCauseButHidesItFromClient(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelError})))
	defer slog.SetDefault(prev)

	e := echo.New()
	rec := httptest.NewRecorder()
	c := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/thing", nil), rec)

	cause := errors.New("connection refused to database")
	Handler(Internal("could not load user").Wrap(cause), c)

	// The wrapped cause must appear in the logs...
	if !strings.Contains(buf.String(), "connection refused to database") {
		t.Fatalf("expected cause in logs, got: %s", buf.String())
	}
	// ...but never in the client response.
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "connection refused") {
		t.Fatalf("client response leaked the cause: %s", rec.Body.String())
	}
}

func TestHandler_DoesNotLog4xx(t *testing.T) {
	var buf bytes.Buffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelError})))
	defer slog.SetDefault(prev)

	e := echo.New()
	rec := httptest.NewRecorder()
	c := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/thing", nil), rec)

	Handler(BadRequest("bad", "nope"), c)

	if buf.Len() != 0 {
		t.Fatalf("4xx should not be logged at error level, got: %s", buf.String())
	}
}

func TestHandler_Reports5xxToErrorTracker(t *testing.T) {
	rep := &recordingReporter{}
	obs.Set(rep)

	e := echo.New()

	// 4xx must not be reported.
	c4 := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/x", nil), httptest.NewRecorder())
	Handler(BadRequest("bad", "nope"), c4)
	if rep.count != 0 {
		t.Fatalf("4xx should not be reported, count = %d", rep.count)
	}

	// 5xx must be reported once.
	c5 := e.NewContext(httptest.NewRequest(http.MethodGet, "/api/x", nil), httptest.NewRecorder())
	Handler(Internal("boom").Wrap(errors.New("cause")), c5)
	if rep.count != 1 {
		t.Fatalf("5xx should be reported once, count = %d", rep.count)
	}
}
