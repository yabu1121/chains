package jwt

import (
	"testing"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const testSecret = "test-secret-at-least-32-bytes-long-xxxx"

func TestIssueVerifyRoundTrip(t *testing.T) {
	m := NewManager(testSecret, time.Hour)
	uid := uuid.New()
	tok, jti, _, err := m.Issue(uid)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if jti == "" {
		t.Fatal("expected a non-empty jti")
	}
	got, err := m.Verify(tok)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if got.UserID != uid {
		t.Fatalf("subject = %s, want %s", got.UserID, uid)
	}
	if got.ID != jti {
		t.Fatalf("jti = %s, want %s", got.ID, jti)
	}
}

func TestIssueGivesUniqueJTIs(t *testing.T) {
	m := NewManager(testSecret, time.Hour)
	uid := uuid.New()
	_, jti1, _, _ := m.Issue(uid)
	_, jti2, _, _ := m.Issue(uid)
	if jti1 == jti2 {
		t.Fatal("expected distinct jti per issued token")
	}
}

func TestVerifyRejectsAlgNone(t *testing.T) {
	m := NewManager(testSecret, time.Hour)
	claims := Claims{RegisteredClaims: gojwt.RegisteredClaims{
		Subject:   uuid.New().String(),
		Issuer:    "chains",
		ExpiresAt: gojwt.NewNumericDate(time.Now().Add(time.Hour)),
	}}
	tok, err := gojwt.NewWithClaims(gojwt.SigningMethodNone, claims).
		SignedString(gojwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("sign none: %v", err)
	}
	if _, err := m.Verify(tok); err == nil {
		t.Fatal("expected alg=none token to be rejected")
	}
}

func TestVerifyRejectsMissingExp(t *testing.T) {
	m := NewManager(testSecret, time.Hour)
	claims := Claims{RegisteredClaims: gojwt.RegisteredClaims{
		Subject: uuid.New().String(),
		Issuer:  "chains",
		// no ExpiresAt
	}}
	tok, err := gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims).
		SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if _, err := m.Verify(tok); err == nil {
		t.Fatal("expected token without exp to be rejected")
	}
}

func TestVerifyRejectsWrongIssuer(t *testing.T) {
	m := NewManager(testSecret, time.Hour)
	claims := Claims{RegisteredClaims: gojwt.RegisteredClaims{
		Subject:   uuid.New().String(),
		Issuer:    "evil",
		ExpiresAt: gojwt.NewNumericDate(time.Now().Add(time.Hour)),
	}}
	tok, _ := gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims).
		SignedString([]byte(testSecret))
	if _, err := m.Verify(tok); err == nil {
		t.Fatal("expected wrong-issuer token to be rejected")
	}
}
