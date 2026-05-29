package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/jwt"
)

// fakeUserStore is an in-memory userStore for fast service tests.
type fakeUserStore struct {
	byEmail    map[string]*models.User
	byUsername map[string]*models.User
	byID       map[uuid.UUID]*models.User
}

func newFakeUserStore() *fakeUserStore {
	return &fakeUserStore{
		byEmail:    map[string]*models.User{},
		byUsername: map[string]*models.User{},
		byID:       map[uuid.UUID]*models.User{},
	}
}

func (f *fakeUserStore) Create(_ context.Context, u *models.User) error {
	if _, ok := f.byEmail[u.Email]; ok {
		return gorm.ErrDuplicatedKey
	}
	if _, ok := f.byUsername[u.Username]; ok {
		return gorm.ErrDuplicatedKey
	}
	cp := *u
	f.byEmail[u.Email] = &cp
	f.byUsername[u.Username] = &cp
	f.byID[u.ID] = &cp
	return nil
}

func (f *fakeUserStore) ExistsByEmail(_ context.Context, email string) (bool, error) {
	_, ok := f.byEmail[email]
	return ok, nil
}

func (f *fakeUserStore) ExistsByUsername(_ context.Context, username string) (bool, error) {
	_, ok := f.byUsername[username]
	return ok, nil
}

func (f *fakeUserStore) FindByEmail(_ context.Context, email string) (*models.User, error) {
	u, ok := f.byEmail[email]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return u, nil
}

func (f *fakeUserStore) FindByID(_ context.Context, id uuid.UUID) (*models.User, error) {
	u, ok := f.byID[id]
	if !ok {
		return nil, gorm.ErrRecordNotFound
	}
	return u, nil
}

func newTestService(store userStore) *Service {
	return NewService(store, jwt.NewManager("test-secret", time.Hour), bcrypt.MinCost)
}

func assertHTTPStatus(t *testing.T, err error, status int, code string) {
	t.Helper()
	var appErr *httperr.Error
	require.True(t, errors.As(err, &appErr), "expected *httperr.Error, got %T (%v)", err, err)
	require.Equal(t, status, appErr.Status)
	require.Equal(t, code, appErr.Code)
}

func TestRegister_Success(t *testing.T) {
	svc := newTestService(newFakeUserStore())
	resp, err := svc.Register(context.Background(), RegisterRequest{
		Email:       "Alice@Example.com",
		Username:    "Alice_01",
		Password:    "supersecret",
		DisplayName: "Alice",
	})
	require.NoError(t, err)
	require.NotEmpty(t, resp.Token)
	require.Equal(t, "alice@example.com", resp.User.Email, "email should be normalised")
	require.Equal(t, "alice_01", resp.User.Username, "username should be normalised to lowercase")
	require.NotEqual(t, uuid.Nil, resp.User.ID)
	require.WithinDuration(t, time.Now().Add(time.Hour), resp.ExpiresAt, time.Minute)
}

func TestRegister_DuplicateEmail(t *testing.T) {
	store := newFakeUserStore()
	svc := newTestService(store)
	req := RegisterRequest{Email: "bob@example.com", Username: "bob", Password: "supersecret", DisplayName: "Bob"}
	_, err := svc.Register(context.Background(), req)
	require.NoError(t, err)

	_, err = svc.Register(context.Background(), req)
	assertHTTPStatus(t, err, 409, "email_taken")
}

func TestRegister_DuplicateUsername(t *testing.T) {
	svc := newTestService(newFakeUserStore())
	_, err := svc.Register(context.Background(), RegisterRequest{
		Email: "one@example.com", Username: "samehandle", Password: "supersecret", DisplayName: "One",
	})
	require.NoError(t, err)

	_, err = svc.Register(context.Background(), RegisterRequest{
		Email: "two@example.com", Username: "SameHandle", Password: "supersecret", DisplayName: "Two",
	})
	assertHTTPStatus(t, err, 409, "username_taken")
}

func TestRegister_InvalidUsername(t *testing.T) {
	svc := newTestService(newFakeUserStore())
	_, err := svc.Register(context.Background(), RegisterRequest{
		Email: "x@example.com", Username: "ab", Password: "supersecret", DisplayName: "X",
	})
	assertHTTPStatus(t, err, 400, "invalid_username")
}

func TestRegister_StoresHashedPassword(t *testing.T) {
	store := newFakeUserStore()
	svc := newTestService(store)
	_, err := svc.Register(context.Background(), RegisterRequest{
		Email: "carol@example.com", Username: "carol", Password: "supersecret", DisplayName: "Carol",
	})
	require.NoError(t, err)

	stored := store.byEmail["carol@example.com"]
	require.NotEqual(t, "supersecret", stored.PasswordHash)
	require.NoError(t, bcrypt.CompareHashAndPassword([]byte(stored.PasswordHash), []byte("supersecret")))
}

func TestLogin_Success(t *testing.T) {
	svc := newTestService(newFakeUserStore())
	_, err := svc.Register(context.Background(), RegisterRequest{
		Email: "dave@example.com", Username: "dave", Password: "supersecret", DisplayName: "Dave",
	})
	require.NoError(t, err)

	resp, err := svc.Login(context.Background(), LoginRequest{Email: "DAVE@example.com", Password: "supersecret"})
	require.NoError(t, err)
	require.NotEmpty(t, resp.Token)
}

func TestLogin_WrongPassword(t *testing.T) {
	svc := newTestService(newFakeUserStore())
	_, err := svc.Register(context.Background(), RegisterRequest{
		Email: "erin@example.com", Username: "erin", Password: "supersecret", DisplayName: "Erin",
	})
	require.NoError(t, err)

	_, err = svc.Login(context.Background(), LoginRequest{Email: "erin@example.com", Password: "wrongpass"})
	assertHTTPStatus(t, err, 401, "invalid_credentials")
}

func TestLogin_UnknownUser(t *testing.T) {
	svc := newTestService(newFakeUserStore())
	_, err := svc.Login(context.Background(), LoginRequest{Email: "ghost@example.com", Password: "whatever1"})
	assertHTTPStatus(t, err, 401, "invalid_credentials")
}

func TestMe_NotFound(t *testing.T) {
	svc := newTestService(newFakeUserStore())
	_, err := svc.Me(context.Background(), uuid.New())
	assertHTTPStatus(t, err, 404, "user_not_found")
}
