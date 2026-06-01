package auth

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/jwt"
)

// usernamePattern allows lowercase letters, digits and underscore, 3-30 chars.
var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{3,30}$`)

// Password bounds are enforced in *bytes* (not runes). bcrypt silently
// truncates its input at 72 bytes, so anything longer is both insecure
// (trailing bytes are ignored) and a foot-gun; we reject it outright. The
// go-playground validator's min/max count runes, so a multi-byte password can
// pass `max=72` yet exceed 72 bytes — these checks are the authoritative ones.
const (
	minPasswordBytes = 8
	maxPasswordBytes = 72
)

// userStore is the data access the service needs; satisfied by *Repository and
// by mocks in tests.
type userStore interface {
	Create(ctx context.Context, u *models.User) error
	ExistsByEmail(ctx context.Context, email string) (bool, error)
	ExistsByUsername(ctx context.Context, username string) (bool, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByID(ctx context.Context, id uuid.UUID) (*models.User, error)
	DeleteByID(ctx context.Context, id uuid.UUID) error
}

// Service implements registration, login and profile lookup.
type Service struct {
	users     userStore
	jwt       *jwt.Manager
	tokens    *TokenStore
	bcrypt    int
	dummyHash []byte // bcrypt hash compared against when no user is found
}

// NewService builds a Service. cost is the bcrypt cost (use bcrypt.DefaultCost).
func NewService(users userStore, jwtm *jwt.Manager, tokens *TokenStore, bcryptCost int) *Service {
	if bcryptCost == 0 {
		bcryptCost = bcrypt.DefaultCost
	}
	// Precompute a hash at the same cost so Login can spend a comparable
	// amount of time when the account does not exist, removing the timing
	// side-channel that would otherwise reveal which emails are registered.
	dummy, _ := bcrypt.GenerateFromPassword([]byte("dummy-password-for-constant-time"), bcryptCost)
	return &Service{users: users, jwt: jwtm, tokens: tokens, bcrypt: bcryptCost, dummyHash: dummy}
}

// Register creates an account and returns a freshly issued session.
func (s *Service) Register(ctx context.Context, req RegisterRequest) (*Session, error) {
	email := normaliseEmail(req.Email)
	username := strings.ToLower(strings.TrimSpace(req.Username))
	if !usernamePattern.MatchString(username) {
		return nil, httperr.BadRequest("invalid_username", "username must be 3-30 characters of lowercase letters, digits or underscore")
	}
	if n := len(req.Password); n < minPasswordBytes || n > maxPasswordBytes {
		return nil, httperr.BadRequest("invalid_password", "password must be between 8 and 72 bytes")
	}

	if taken, err := s.users.ExistsByEmail(ctx, email); err != nil {
		return nil, httperr.Internal("could not check email").Wrap(err)
	} else if taken {
		return nil, httperr.Conflict("email_taken", "an account with this email already exists")
	}
	if taken, err := s.users.ExistsByUsername(ctx, username); err != nil {
		return nil, httperr.Internal("could not check username").Wrap(err)
	} else if taken {
		return nil, httperr.Conflict("username_taken", "this username is already taken")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), s.bcrypt)
	if err != nil {
		return nil, httperr.Internal("could not hash password").Wrap(err)
	}

	user := &models.User{
		ID:           uuid.New(),
		Email:        email,
		Username:     username,
		PasswordHash: string(hash),
		DisplayName:  strings.TrimSpace(req.DisplayName),
	}
	if err := s.users.Create(ctx, user); err != nil {
		// Backstop for a race between the checks above and insert.
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			return nil, httperr.Conflict("account_exists", "email or username is already taken")
		}
		return nil, httperr.Internal("could not create user").Wrap(err)
	}

	return s.issue(ctx, user)
}

// Login verifies credentials and returns a session. Errors are intentionally
// uniform to avoid leaking which accounts exist.
func (s *Service) Login(ctx context.Context, req LoginRequest) (*Session, error) {
	// A password longer than bcrypt's 72-byte limit can never be the one we
	// stored (registration rejects them), so fail uniformly without hashing.
	// This also bounds the work bcrypt does on attacker-supplied input.
	if len(req.Password) > maxPasswordBytes {
		return nil, errInvalidCredentials()
	}
	user, err := s.users.FindByEmail(ctx, normaliseEmail(req.Email))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Spend a comparable amount of time hashing so the response
			// latency does not reveal that the account is absent.
			_ = bcrypt.CompareHashAndPassword(s.dummyHash, []byte(req.Password))
			return nil, errInvalidCredentials()
		}
		return nil, httperr.Internal("could not load user").Wrap(err)
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		return nil, errInvalidCredentials()
	}
	return s.issue(ctx, user)
}

// Refresh rotates a refresh token and issues a new session. An invalid or
// already-used refresh token yields a 401.
func (s *Service) Refresh(ctx context.Context, refreshToken string) (*Session, error) {
	userID, err := s.tokens.ConsumeRefresh(ctx, refreshToken)
	if err != nil {
		if errors.Is(err, ErrInvalidRefresh) {
			return nil, httperr.Unauthorized("invalid_refresh", "session expired; please log in again")
		}
		return nil, httperr.Internal("could not refresh session").Wrap(err)
	}
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Account gone (e.g. deleted) but token still around: treat as logged out.
			return nil, httperr.Unauthorized("invalid_refresh", "session expired; please log in again")
		}
		return nil, httperr.Internal("could not load user").Wrap(err)
	}
	return s.issue(ctx, user)
}

// Logout revokes the refresh token and denylists the current access token's
// jti for its remaining lifetime. Missing/empty inputs are tolerated so logout
// is idempotent.
func (s *Service) Logout(ctx context.Context, refreshToken, accessJTI string, accessExp time.Time) error {
	if err := s.tokens.DeleteRefresh(ctx, refreshToken); err != nil {
		return httperr.Internal("could not revoke refresh token").Wrap(err)
	}
	if ttl := time.Until(accessExp); ttl > 0 {
		if err := s.tokens.RevokeAccess(ctx, accessJTI, ttl); err != nil {
			return httperr.Internal("could not revoke access token").Wrap(err)
		}
	}
	return nil
}

// DeleteAccount permanently erases the caller's account after re-confirming
// their password. Related rows (friendships, blocks, languages, avatar) are
// removed by ON DELETE CASCADE. The presented refresh token and current access
// token are revoked so the now-deleted session cannot continue. Cached views
// (network graph, friends) converge within their short TTLs.
func (s *Service) DeleteAccount(ctx context.Context, userID uuid.UUID, password, refreshToken, accessJTI string, accessExp time.Time) error {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return httperr.NotFound("user_not_found", "user not found")
		}
		return httperr.Internal("could not load user").Wrap(err)
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return httperr.Forbidden("invalid_password", "password is incorrect")
	}
	if err := s.users.DeleteByID(ctx, userID); err != nil {
		return httperr.Internal("could not delete account").Wrap(err)
	}
	// Best-effort session teardown; the account is already gone.
	_ = s.Logout(ctx, refreshToken, accessJTI, accessExp)
	return nil
}

// Me returns the current user's profile.
func (s *Service) Me(ctx context.Context, userID uuid.UUID) (*UserResponse, error) {
	user, err := s.users.FindByID(ctx, userID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("user_not_found", "user not found")
		}
		return nil, httperr.Internal("could not load user").Wrap(err)
	}
	resp := toUserResponse(user)
	return &resp, nil
}

// issue mints a fresh access+refresh pair for a user.
func (s *Service) issue(ctx context.Context, user *models.User) (*Session, error) {
	access, _, accessExp, err := s.jwt.Issue(user.ID)
	if err != nil {
		return nil, httperr.Internal("could not issue token").Wrap(err)
	}
	refresh, refreshExp, err := s.tokens.CreateRefresh(ctx, user.ID)
	if err != nil {
		return nil, httperr.Internal("could not issue refresh token").Wrap(err)
	}
	return &Session{
		AccessToken:    access,
		AccessExpires:  accessExp,
		RefreshToken:   refresh,
		RefreshExpires: refreshExp,
		User:           toUserResponse(user),
	}, nil
}

func normaliseEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func errInvalidCredentials() error {
	return httperr.Unauthorized("invalid_credentials", "email or password is incorrect")
}
