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
