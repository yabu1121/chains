package blobstore

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/cymed/chains/backend/internal/models"
)

// Postgres stores blobs in the user_avatars table (one row per user). It is the
// default backend and preserves the original on-database storage behaviour.
type Postgres struct {
	db *gorm.DB
}

// NewPostgres builds a Postgres blob store.
func NewPostgres(db *gorm.DB) *Postgres {
	return &Postgres{db: db}
}

// key is a user UUID string.
func parseKey(key string) (uuid.UUID, error) {
	id, err := uuid.Parse(key)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid blob key %q: %w", key, err)
	}
	return id, nil
}

func (p *Postgres) Put(ctx context.Context, key string, obj Object) error {
	id, err := parseKey(key)
	if err != nil {
		return err
	}
	row := &models.UserAvatar{UserID: id, Data: obj.Data, ContentType: obj.ContentType, UpdatedAt: time.Now().UTC()}
	return p.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"data", "content_type", "updated_at"}),
	}).Create(row).Error
}

func (p *Postgres) Get(ctx context.Context, key string) (Object, error) {
	id, err := parseKey(key)
	if err != nil {
		return Object{}, err
	}
	var row models.UserAvatar
	if err := p.db.WithContext(ctx).First(&row, "user_id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Object{}, ErrNotFound
		}
		return Object{}, err
	}
	return Object{Data: row.Data, ContentType: row.ContentType}, nil
}

func (p *Postgres) Delete(ctx context.Context, key string) error {
	id, err := parseKey(key)
	if err != nil {
		return err
	}
	return p.db.WithContext(ctx).Delete(&models.UserAvatar{}, "user_id = ?", id).Error
}
