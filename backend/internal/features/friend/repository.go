package friend

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/cymed/chains/backend/internal/models"
)

// onConflictDoNothingBlock makes a repeated block insert idempotent against the
// (blocker_id, blocked_id) unique constraint.
func onConflictDoNothingBlock() clause.OnConflict {
	return clause.OnConflict{
		Columns:   []clause.Column{{Name: "blocker_id"}, {Name: "blocked_id"}},
		DoNothing: true,
	}
}

// Repository is the friend slice's data access for friendships and blocks.
type Repository struct {
	db *gorm.DB
}

// NewRepository builds a Repository.
func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

// UserExists reports whether a user row exists.
func (r *Repository) UserExists(ctx context.Context, id uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", id).Count(&count).Error
	return count > 0, err
}

// GetFriendship returns the relationship between two users regardless of
// direction, or gorm.ErrRecordNotFound.
func (r *Repository) GetFriendship(ctx context.Context, a, b uuid.UUID) (*models.Friendship, error) {
	var f models.Friendship
	err := r.db.WithContext(ctx).
		Where("(requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)", a, b, b, a).
		First(&f).Error
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// GetFriendshipByID loads a friendship by its primary key.
func (r *Repository) GetFriendshipByID(ctx context.Context, id uuid.UUID) (*models.Friendship, error) {
	var f models.Friendship
	if err := r.db.WithContext(ctx).First(&f, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &f, nil
}

// CreateFriendship inserts a friendship row. A symmetric unique-index
// violation surfaces as gorm.ErrDuplicatedKey.
func (r *Repository) CreateFriendship(ctx context.Context, f *models.Friendship) error {
	return r.db.WithContext(ctx).Create(f).Error
}

// AcceptFriendship marks a pending row accepted, but only if it is still
// pending and addressed to addresseeID — a compare-and-set that prevents a
// concurrent accept/reject from racing. Returns the number of rows changed so
// the caller can tell a no-op (0) from a successful accept (1).
func (r *Repository) AcceptFriendship(ctx context.Context, id, addresseeID uuid.UUID, at time.Time) (int64, error) {
	res := r.db.WithContext(ctx).
		Model(&models.Friendship{}).
		Where("id = ? AND addressee_id = ? AND status = ?", id, addresseeID, models.FriendshipPending).
		Updates(map[string]any{
			"status":      models.FriendshipAccepted,
			"accepted_at": at,
			"updated_at":  at,
		})
	return res.RowsAffected, res.Error
}

// DeleteFriendship removes a friendship row by ID.
func (r *Repository) DeleteFriendship(ctx context.Context, id uuid.UUID) error {
	return r.db.WithContext(ctx).Delete(&models.Friendship{}, "id = ?", id).Error
}

// DeleteFriendshipBetween removes the relationship between two users in either
// direction and reports how many rows were removed.
func (r *Repository) DeleteFriendshipBetween(ctx context.Context, a, b uuid.UUID) (int64, error) {
	res := r.db.WithContext(ctx).
		Where("(requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)", a, b, b, a).
		Delete(&models.Friendship{})
	return res.RowsAffected, res.Error
}

// ListAcceptedFriendships returns accepted relationships involving the user,
// with both party records preloaded so the caller can pick the other side.
func (r *Repository) ListAcceptedFriendships(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	var rows []models.Friendship
	err := r.db.WithContext(ctx).
		Preload("Requester").Preload("Addressee").
		Where("status = ? AND (requester_id = ? OR addressee_id = ?)", models.FriendshipAccepted, userID, userID).
		Order("accepted_at DESC NULLS LAST").
		Find(&rows).Error
	return rows, err
}

// LanguagesByUsers returns each given user's languages (in their chosen order),
// keyed by user ID, in a single query. Users with no languages are absent.
func (r *Repository) LanguagesByUsers(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID][]string, error) {
	out := make(map[uuid.UUID][]string)
	if len(ids) == 0 {
		return out, nil
	}
	var rows []models.UserLanguage
	err := r.db.WithContext(ctx).
		Where("user_id IN ?", ids).
		Order("user_id, position ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		out[row.UserID] = append(out[row.UserID], row.Language)
	}
	return out, nil
}

// ListPendingIncoming returns pending requests addressed to the user, with the
// requester preloaded.
func (r *Repository) ListPendingIncoming(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	var rows []models.Friendship
	err := r.db.WithContext(ctx).
		Preload("Requester").
		Where("status = ? AND addressee_id = ?", models.FriendshipPending, userID).
		Order("created_at DESC").
		Find(&rows).Error
	return rows, err
}

// ListPendingOutgoing returns pending requests the user has sent, with the
// addressee preloaded.
func (r *Repository) ListPendingOutgoing(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	var rows []models.Friendship
	err := r.db.WithContext(ctx).
		Preload("Addressee").
		Where("status = ? AND requester_id = ?", models.FriendshipPending, userID).
		Order("created_at DESC").
		Find(&rows).Error
	return rows, err
}

// CountPendingIncoming counts pending requests addressed to the user.
func (r *Repository) CountPendingIncoming(ctx context.Context, userID uuid.UUID) (int64, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Friendship{}).
		Where("status = ? AND addressee_id = ?", models.FriendshipPending, userID).
		Count(&count).Error
	return count, err
}

// IsBlockedEitherWay reports whether either user has blocked the other.
func (r *Repository) IsBlockedEitherWay(ctx context.Context, a, b uuid.UUID) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&models.Block{}).
		Where("(blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)", a, b, b, a).
		Count(&count).Error
	return count > 0, err
}

// BlockUser atomically removes any relationship between the pair and inserts a
// block from blocker to blocked. A repeated block is a no-op (idempotent).
func (r *Repository) BlockUser(ctx context.Context, blocker, blocked uuid.UUID) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.
			Where("(requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)", blocker, blocked, blocked, blocker).
			Delete(&models.Friendship{}).Error; err != nil {
			return err
		}
		block := &models.Block{ID: uuid.New(), BlockerID: blocker, BlockedID: blocked}
		return tx.Clauses(onConflictDoNothingBlock()).Create(block).Error
	})
}

// Unblock removes a block and reports how many rows were removed.
func (r *Repository) Unblock(ctx context.Context, blocker, blocked uuid.UUID) (int64, error) {
	res := r.db.WithContext(ctx).
		Where("blocker_id = ? AND blocked_id = ?", blocker, blocked).
		Delete(&models.Block{})
	return res.RowsAffected, res.Error
}

// ListBlocked returns the users the given user has blocked.
func (r *Repository) ListBlocked(ctx context.Context, blocker uuid.UUID) ([]models.User, error) {
	var users []models.User
	err := r.db.WithContext(ctx).
		Joins("JOIN blocks ON blocks.blocked_id = users.id").
		Where("blocks.blocker_id = ?", blocker).
		Order("blocks.created_at DESC").
		Find(&users).Error
	return users, err
}
