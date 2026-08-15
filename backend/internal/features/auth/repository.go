package auth

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
)

// Repository is the auth slice's data access for users.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// Create inserts a new user. Returns gorm.ErrDuplicatedKey when the email
// already exists (GORM TranslateError is enabled).
func (r *Repository) Create(ctx context.Context, u *models.User) error {
	return r.db.WithContext(ctx).Create(u).Error
}

// ExistsByEmail reports whether an account with the given email exists.
func (r *Repository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.User{}).Where("email = ?", email).Count(&count).Error
	return count > 0, err
}

// ExistsByUsername reports whether an account with the given username exists.
func (r *Repository) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.User{}).Where("username = ?", username).Count(&count).Error
	return count > 0, err
}

// FindByEmail returns the user with the given (already normalised) email, or
// gorm.ErrRecordNotFound.
func (r *Repository) FindByEmail(ctx context.Context, email string) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).Where("email = ?", email).First(&u).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// FindByID returns the user by ID, or gorm.ErrRecordNotFound.
func (r *Repository) FindByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	var u models.User
	if err := r.db.WithContext(ctx).First(&u, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}

// DeleteByID removes a user row. The users foreign keys are declared
// ON DELETE CASCADE, so this also erases the user's friendships, blocks,
// languages and avatar — a full GDPR-style data deletion in one statement.
func (r *Repository) DeleteByID(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&models.User{}, "id = ?", id).Error
}

// FindIdentity returns the identity for a given provider + provider user id, or
// gorm.ErrRecordNotFound when this external account has never logged in before.
func (r *Repository) FindIdentity(ctx context.Context, provider, providerUserID string) (*models.UserIdentity, error) {
	var id models.UserIdentity
	err := r.db.WithContext(ctx).
		Where("provider = ? AND provider_user_id = ?", provider, providerUserID).
		First(&id).Error
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// CreateIdentity links an external account to an existing user.
func (r *Repository) CreateIdentity(ctx context.Context, id *models.UserIdentity) error {
	return r.db.WithContext(ctx).Create(id).Error
}

// CreateUserWithIdentity creates a brand-new user and its first external
// identity atomically, so a failure never leaves a user with no way to log in
// (it has no password) or an orphaned identity.
func (r *Repository) CreateUserWithIdentity(ctx context.Context, u *models.User, id *models.UserIdentity) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(u).Error; err != nil {
			return err
		}
		id.UserID = u.ID
		return tx.Create(id).Error
	})
}
