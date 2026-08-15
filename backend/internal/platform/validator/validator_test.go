package validator

import (
	"strings"
	"testing"
)

type sample struct {
	Email string `json:"email" validate:"required,email"`
	Name  string `json:"display_name" validate:"required,min=3"`
}

func TestValidateSanitizesMessages(t *testing.T) {
	err := New().Validate(sample{Email: "nope", Name: "ab"})
	if err == nil {
		t.Fatal("expected validation error")
	}
	msg := err.Error()

	// Must reference the JSON field names...
	if !strings.Contains(msg, "email") || !strings.Contains(msg, "display_name") {
		t.Fatalf("expected JSON field names in message, got %q", msg)
	}
	// ...and must NOT leak the Go struct/field identifiers or raw tags.
	for _, leak := range []string{"sample", "Email", "Name", "Field validation", "'email'", "'min'"} {
		if strings.Contains(msg, leak) {
			t.Fatalf("message leaked internal detail %q: %q", leak, msg)
		}
	}
}

func TestValidatePassesValidInput(t *testing.T) {
	if err := New().Validate(sample{Email: "a@b.com", Name: "abc"}); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}
