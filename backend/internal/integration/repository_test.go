package integration

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/features/auth"
	"github.com/cymed/chains/backend/internal/features/friend"
	"github.com/cymed/chains/backend/internal/models"
)

func insertUser(t *testing.T, db *gorm.DB, email, name string) *models.User {
	t.Helper()
	username := strings.SplitN(email, "@", 2)[0]
	u := &models.User{ID: uuid.New(), Email: email, Username: username, PasswordHash: "x", DisplayName: name}
	require.NoError(t, auth.NewRepository(db).Create(context.Background(), u))
	return u
}

func TestAuthRepo_DuplicateEmail(t *testing.T) {
	db := freshDB(t)
	repo := auth.NewRepository(db)
	ctx := context.Background()

	u1 := &models.User{ID: uuid.New(), Email: "dup@example.com", Username: "dup_one", PasswordHash: "x", DisplayName: "One"}
	require.NoError(t, repo.Create(ctx, u1))

	u2 := &models.User{ID: uuid.New(), Email: "dup@example.com", Username: "dup_two", PasswordHash: "x", DisplayName: "Two"}
	err := repo.Create(ctx, u2)
	require.ErrorIs(t, err, gorm.ErrDuplicatedKey)
}

func TestAuthRepo_DuplicateEmailIsCaseInsensitive(t *testing.T) {
	db := freshDB(t)
	repo := auth.NewRepository(db)
	ctx := context.Background()

	u1 := &models.User{ID: uuid.New(), Email: "case@example.com", Username: "case_one", PasswordHash: "x", DisplayName: "One"}
	require.NoError(t, repo.Create(ctx, u1))

	// Same email differing only in case must collide via the lower() index,
	// even though the app normally lowercases before insert.
	u2 := &models.User{ID: uuid.New(), Email: "Case@Example.com", Username: "case_two", PasswordHash: "x", DisplayName: "Two"}
	err := repo.Create(ctx, u2)
	require.ErrorIs(t, err, gorm.ErrDuplicatedKey, "email uniqueness must be case-insensitive")
}

func TestAuthRepo_DuplicateUsernameIsCaseInsensitive(t *testing.T) {
	db := freshDB(t)
	repo := auth.NewRepository(db)
	ctx := context.Background()

	u1 := &models.User{ID: uuid.New(), Email: "ufirst@example.com", Username: "samehandle", PasswordHash: "x", DisplayName: "One"}
	require.NoError(t, repo.Create(ctx, u1))

	u2 := &models.User{ID: uuid.New(), Email: "usecond@example.com", Username: "SameHandle", PasswordHash: "x", DisplayName: "Two"}
	err := repo.Create(ctx, u2)
	require.ErrorIs(t, err, gorm.ErrDuplicatedKey, "username uniqueness must be case-insensitive")
}

func TestFriendRepo_SymmetricUniquePreventsReversePair(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "a@example.com", "A")
	b := insertUser(t, db, "b@example.com", "B")
	repo := friend.NewRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.CreateFriendship(ctx, &models.Friendship{
		ID: uuid.New(), RequesterID: a.ID, AddresseeID: b.ID, Status: models.FriendshipPending,
	}))

	// The reverse-direction pair must be rejected by uq_friendship_pair.
	err := repo.CreateFriendship(ctx, &models.Friendship{
		ID: uuid.New(), RequesterID: b.ID, AddresseeID: a.ID, Status: models.FriendshipPending,
	})
	require.ErrorIs(t, err, gorm.ErrDuplicatedKey)
}

func TestFriendRepo_AcceptFriendshipIsCAS(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "req@example.com", "Req")
	b := insertUser(t, db, "addr@example.com", "Addr")
	repo := friend.NewRepository(db)
	ctx := context.Background()

	id := uuid.New()
	require.NoError(t, repo.CreateFriendship(ctx, &models.Friendship{
		ID: id, RequesterID: a.ID, AddresseeID: b.ID, Status: models.FriendshipPending,
	}))

	// Only the addressee may accept.
	n, err := repo.AcceptFriendship(ctx, id, a.ID, time.Now())
	require.NoError(t, err)
	require.Equal(t, int64(0), n, "requester must not be able to accept")

	// Addressee accepts: exactly one row changes.
	n, err = repo.AcceptFriendship(ctx, id, b.ID, time.Now())
	require.NoError(t, err)
	require.Equal(t, int64(1), n)

	// A second accept is a no-op because the row is no longer pending — this
	// is the race-loser path.
	n, err = repo.AcceptFriendship(ctx, id, b.ID, time.Now())
	require.NoError(t, err)
	require.Equal(t, int64(0), n, "accepting an already-accepted row must affect 0 rows")
}

func TestFriendRepo_CreateFriendshipUnlessBlocked(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "sender@example.com", "Sender")
	b := insertUser(t, db, "target@example.com", "Target")
	repo := friend.NewRepository(db)
	ctx := context.Background()

	// b blocks a.
	require.NoError(t, repo.BlockUser(ctx, b.ID, a.ID))

	// a's request must be refused, and no stray pending row may be left.
	err := repo.CreateFriendshipUnlessBlocked(ctx, &models.Friendship{
		ID: uuid.New(), RequesterID: a.ID, AddresseeID: b.ID, Status: models.FriendshipPending,
	})
	require.ErrorIs(t, err, friend.ErrBlocked)

	_, err = repo.GetFriendship(ctx, a.ID, b.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound, "no friendship row should exist after a blocked send")
}

func TestFriendRepo_SelfFriendshipRejected(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "self@example.com", "Self")
	repo := friend.NewRepository(db)

	err := repo.CreateFriendship(context.Background(), &models.Friendship{
		ID: uuid.New(), RequesterID: a.ID, AddresseeID: a.ID, Status: models.FriendshipPending,
	})
	require.Error(t, err, "friendships_no_self CHECK must reject self friendship")
}

func TestFriendRepo_GetFriendshipEitherDirection(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "a@example.com", "A")
	b := insertUser(t, db, "b@example.com", "B")
	repo := friend.NewRepository(db)
	ctx := context.Background()

	id := uuid.New()
	require.NoError(t, repo.CreateFriendship(ctx, &models.Friendship{
		ID: id, RequesterID: a.ID, AddresseeID: b.ID, Status: models.FriendshipPending,
	}))

	// Lookup with arguments reversed still finds the row.
	got, err := repo.GetFriendship(ctx, b.ID, a.ID)
	require.NoError(t, err)
	require.Equal(t, id, got.ID)
}

func TestFriendRepo_BlockUserRemovesFriendshipAndIsIdempotent(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "a@example.com", "A")
	b := insertUser(t, db, "b@example.com", "B")
	repo := friend.NewRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.CreateFriendship(ctx, &models.Friendship{
		ID: uuid.New(), RequesterID: a.ID, AddresseeID: b.ID, Status: models.FriendshipAccepted,
	}))

	require.NoError(t, repo.BlockUser(ctx, a.ID, b.ID))

	_, err := repo.GetFriendship(ctx, a.ID, b.ID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound, "block must remove the friendship")

	blocked, err := repo.IsBlockedEitherWay(ctx, a.ID, b.ID)
	require.NoError(t, err)
	require.True(t, blocked)

	// Blocking again must not error (ON CONFLICT DO NOTHING).
	require.NoError(t, repo.BlockUser(ctx, a.ID, b.ID))
}

func TestFriendRepo_ListAcceptedPreloadsBothParties(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "a@example.com", "A")
	b := insertUser(t, db, "b@example.com", "B")
	repo := friend.NewRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.CreateFriendship(ctx, &models.Friendship{
		ID: uuid.New(), RequesterID: a.ID, AddresseeID: b.ID, Status: models.FriendshipAccepted,
	}))

	rows, err := repo.ListAcceptedFriendships(ctx, a.ID)
	require.NoError(t, err)
	require.Len(t, rows, 1)
	require.NotNil(t, rows[0].Requester)
	require.NotNil(t, rows[0].Addressee)
	require.Equal(t, "B", rows[0].Addressee.DisplayName)
}

func TestFriendRepo_CountPendingIncoming(t *testing.T) {
	db := freshDB(t)
	a := insertUser(t, db, "a@example.com", "A")
	b := insertUser(t, db, "b@example.com", "B")
	c := insertUser(t, db, "c@example.com", "C")
	repo := friend.NewRepository(db)
	ctx := context.Background()

	require.NoError(t, repo.CreateFriendship(ctx, &models.Friendship{ID: uuid.New(), RequesterID: a.ID, AddresseeID: c.ID, Status: models.FriendshipPending}))
	require.NoError(t, repo.CreateFriendship(ctx, &models.Friendship{ID: uuid.New(), RequesterID: b.ID, AddresseeID: c.ID, Status: models.FriendshipPending}))

	n, err := repo.CountPendingIncoming(ctx, c.ID)
	require.NoError(t, err)
	require.Equal(t, int64(2), n)
}
