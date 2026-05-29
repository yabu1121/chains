package auth

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
	"github.com/cymed/chains/backend/internal/platform/jwt"
)

// usernamePattern allows lowercase letters, digits and underscore, 3-30 chars.
var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{3,30}$`)

// userStore is the data access the service needs; satisfied by *Repository and
// by mocks in tests.
type userStore interface {
	Create(ctx context.Context, u *models.User) error
	ExistsByEmail(ctx context.Context, email string) (bool, error)
	ExistsByUsername(ctx context.Context, username string) (bool, error)
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByID(ctx context.Context, id uuid.UUID) (*models.User, error)
}

// Service implements registration, login and profile lookup.
type Service struct {
	users  userStore
	jwt    *jwt.Manager
	bcrypt int
}

// NewService builds a Service. cost is the bcrypt cost (use bcrypt.DefaultCost).
func NewService(users userStore, jwtm *jwt.Manager, bcryptCost int) *Service {
	if bcryptCost == 0 {
		bcryptCost = bcrypt.DefaultCost
	}
	return &Service{users: users, jwt: jwtm, bcrypt: bcryptCost}
}

// Register creates an account and returns a freshly issued token.
func (s *Service) Register(ctx context.Context, req RegisterRequest) (*AuthResponse, error) {
	email := normaliseEmail(req.Email)
	username := strings.ToLower(strings.TrimSpace(req.Username))
	if !usernamePattern.MatchString(username) {
		return nil, httperr.BadRequest("invalid_username", "username must be 3-30 characters of lowercase letters, digits or underscore")
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

	return s.issue(user)
}

// Login verifies credentials and returns a token. Errors are intentionally
// uniform to avoid leaking which accounts exist.
func (s *Service) Login(ctx context.Context, req LoginRequest) (*AuthResponse, error) {
	user, err := s.users.FindByEmail(ctx, normaliseEmail(req.Email))
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errInvalidCredentials()
		}
		return nil, httperr.Internal("could not load user").Wrap(err)
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		return nil, errInvalidCredentials()
	}
	return s.issue(user)
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

func (s *Service) issue(user *models.User) (*AuthResponse, error) {
	token, exp, err := s.jwt.Issue(user.ID)
	if err != nil {
		return nil, httperr.Internal("could not issue token").Wrap(err)
	}
	return &AuthResponse{
		Token:     token,
		ExpiresAt: exp,
		User:      toUserResponse(user),
	}, nil
}

func normaliseEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func errInvalidCredentials() error {
	return httperr.Unauthorized("invalid_credentials", "email or password is incorrect")
}
