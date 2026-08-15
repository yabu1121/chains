package obs

import (
	"context"
	"errors"
	"testing"
)

type captureReporter struct {
	called    int
	lastErr   error
	lastAttrs map[string]string
}

func (c *captureReporter) ReportError(_ context.Context, err error, attrs map[string]string) {
	c.called++
	c.lastErr = err
	c.lastAttrs = attrs
}

func TestReportError_ForwardsToInstalledReporter(t *testing.T) {
	prev := reporter.Load()
	defer reporter.Store(prev)

	cap := &captureReporter{}
	Set(cap)

	err := errors.New("boom")
	ReportError(context.Background(), err, map[string]string{"code": "internal"})

	if cap.called != 1 {
		t.Fatalf("called = %d, want 1", cap.called)
	}
	if cap.lastErr != err {
		t.Fatalf("lastErr = %v, want %v", cap.lastErr, err)
	}
	if cap.lastAttrs["code"] != "internal" {
		t.Fatalf("attrs not forwarded: %v", cap.lastAttrs)
	}
}

func TestReportError_NilErrorIsIgnored(t *testing.T) {
	prev := reporter.Load()
	defer reporter.Store(prev)

	cap := &captureReporter{}
	Set(cap)

	ReportError(context.Background(), nil, nil)
	if cap.called != 0 {
		t.Fatalf("nil error should not be reported, called = %d", cap.called)
	}
}

func TestSet_IgnoresNil(t *testing.T) {
	prev := reporter.Load()
	defer reporter.Store(prev)

	cap := &captureReporter{}
	Set(cap)
	Set(nil) // must not clobber the installed reporter

	ReportError(context.Background(), errors.New("x"), nil)
	if cap.called != 1 {
		t.Fatalf("Set(nil) should not replace reporter; called = %d", cap.called)
	}
}
