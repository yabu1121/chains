package httperr

import (
	"bytes"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/labstack/echo/v4"
)

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
