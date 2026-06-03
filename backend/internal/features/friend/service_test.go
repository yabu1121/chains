package friend

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/httperr"
)

// fakeStore is an in-memory store implementing the service's data dependency.
type fakeStore struct {
	users       map[uuid.UUID]bool
	friendships map[uuid.UUID]*models.Friendship
	blocks      map[[2]uuid.UUID]bool

	// failListAccepted makes ListAcceptedFriendships fail, used to prove the
	// cache short-circuits the store on a hit.
	failListAccepted bool
}

func newFakeStore(userIDs ...uuid.UUID) *fakeStore {
	fs := &fakeStore{
		users:       map[uuid.UUID]bool{},
		friendships: map[uuid.UUID]*models.Friendship{},
		blocks:      map[[2]uuid.UUID]bool{},
	}
	for _, id := range userIDs {
		fs.users[id] = true
	}
	return fs
}

func (f *fakeStore) UserExists(_ context.Context, id uuid.UUID) (bool, error) {
	return f.users[id], nil
}

func (f *fakeStore) GetFriendship(_ context.Context, a, b uuid.UUID) (*models.Friendship, error) {
	for _, fr := range f.friendships {
		if (fr.RequesterID == a && fr.AddresseeID == b) || (fr.RequesterID == b && fr.AddresseeID == a) {
			return fr, nil
		}
	}
	return nil, gorm.ErrRecordNotFound
}

func (f *fakeStore) GetFriendshipByID(_ context.Context, id uuid.UUID) (*models.Friendship, error) {
	if fr, ok := f.friendships[id]; ok {
		return fr, nil
	}
	return nil, gorm.ErrRecordNotFound
}

func (f *fakeStore) CreateFriendship(_ context.Context, fr *models.Friendship) error {
	if existing, _ := f.GetFriendship(context.Background(), fr.RequesterID, fr.AddresseeID); existing != nil {
		return gorm.ErrDuplicatedKey
	}
	cp := *fr
	f.friendships[fr.ID] = &cp
	return nil
}

func (f *fakeStore) CreateFriendshipUnlessBlocked(ctx context.Context, fr *models.Friendship) error {
	if blocked, _ := f.IsBlockedEitherWay(ctx, fr.RequesterID, fr.AddresseeID); blocked {
		return ErrBlocked
	}
	return f.CreateFriendship(ctx, fr)
}

func (f *fakeStore) AcceptFriendship(_ context.Context, id, addresseeID uuid.UUID, at time.Time) (int64, error) {
	fr := f.friendships[id]
	if fr == nil || fr.AddresseeID != addresseeID || fr.Status != models.FriendshipPending {
		return 0, nil
	}
	fr.Status = models.FriendshipAccepted
	fr.AcceptedAt = &at
	return 1, nil
}

func (f *fakeStore) DeleteFriendship(_ context.Context, id uuid.UUID) error {
	delete(f.friendships, id)
	return nil
}

func (f *fakeStore) DeleteFriendshipBetween(_ context.Context, a, b uuid.UUID) (int64, error) {
	var n int64
	for id, fr := range f.friendships {
		if (fr.RequesterID == a && fr.AddresseeID == b) || (fr.RequesterID == b && fr.AddresseeID == a) {
			delete(f.friendships, id)
			n++
		}
	}
	return n, nil
}

func (f *fakeStore) ListAcceptedFriendships(_ context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	if f.failListAccepted {
		return nil, errors.New("store should not have been called")
	}
	var out []models.Friendship
	for _, fr := range f.friendships {
		if fr.Status == models.FriendshipAccepted && (fr.RequesterID == userID || fr.AddresseeID == userID) {
			out = append(out, *fr)
		}
	}
	return out, nil
}

func (f *fakeStore) LanguagesByUsers(_ context.Context, _ []uuid.UUID) (map[uuid.UUID][]string, error) {
	return map[uuid.UUID][]string{}, nil
}

func (f *fakeStore) ListPendingIncoming(_ context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	var out []models.Friendship
	for _, fr := range f.friendships {
		if fr.Status == models.FriendshipPending && fr.AddresseeID == userID {
			out = append(out, *fr)
		}
	}
	return out, nil
}

func (f *fakeStore) ListPendingOutgoing(_ context.Context, userID uuid.UUID) ([]models.Friendship, error) {
	var out []models.Friendship
	for _, fr := range f.friendships {
		if fr.Status == models.FriendshipPending && fr.RequesterID == userID {
			out = append(out, *fr)
		}
	}
	return out, nil
}

func (f *fakeStore) CountPendingIncoming(_ context.Context, userID uuid.UUID) (int64, error) {
	rows, _ := f.ListPendingIncoming(context.Background(), userID)
	return int64(len(rows)), nil
}

func (f *fakeStore) IsBlockedEitherWay(_ context.Context, a, b uuid.UUID) (bool, error) {
	return f.blocks[[2]uuid.UUID{a, b}] || f.blocks[[2]uuid.UUID{b, a}], nil
}

func (f *fakeStore) BlockUser(_ context.Context, blocker, blocked uuid.UUID) error {
	_, _ = f.DeleteFriendshipBetween(context.Background(), blocker, blocked)
	f.blocks[[2]uuid.UUID{blocker, blocked}] = true
	return nil
}

func (f *fakeStore) Unblock(_ context.Context, blocker, blocked uuid.UUID) (int64, error) {
	key := [2]uuid.UUID{blocker, blocked}
	if f.blocks[key] {
		delete(f.blocks, key)
		return 1, nil
	}
	return 0, nil
}

func (f *fakeStore) ListBlocked(_ context.Context, blocker uuid.UUID) ([]models.User, error) {
	var out []models.User
	for key := range f.blocks {
		if key[0] == blocker {
			out = append(out, models.User{ID: key[1]})
		}
	}
	return out, nil
}

func newTestService(t *testing.T, store store) (*Service, *Cache) {
	t.Helper()
	fc := NewCache(cache.NewMemory(), time.Minute)
	return NewService(store, fc), fc
}

func assertHTTPStatus(t *testing.T, err error, status int, code string) {
	t.Helper()
	var appErr *httperr.Error
	require.True(t, errors.As(err, &appErr), "expected *httperr.Error, got %T (%v)", err, err)
	require.Equal(t, status, appErr.Status)
	require.Equal(t, code, appErr.Code)
}

func seedFriendship(fs *fakeStore, requester, addressee uuid.UUID, status models.FriendshipStatus) uuid.UUID {
	id := uuid.New()
	fs.friendships[id] = &models.Friendship{
		ID: id, RequesterID: requester, AddresseeID: addressee, Status: status,
	}
	return id
}

func TestSendRequest_Self(t *testing.T) {
	a := uuid.New()
	svc, _ := newTestService(t, newFakeStore(a))
	_, err := svc.SendRequest(context.Background(), a, a, "")
	assertHTTPStatus(t, err, 400, "self_request")
}

func TestSendRequest_UserNotFound(t *testing.T) {
	a := uuid.New()
	svc, _ := newTestService(t, newFakeStore(a))
	_, err := svc.SendRequest(context.Background(), a, uuid.New(), "")
	assertHTTPStatus(t, err, 404, "user_not_found")
}

func TestSendRequest_Blocked(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	fs.blocks[[2]uuid.UUID{b, a}] = true // b blocked a
	svc, _ := newTestService(t, fs)
	_, err := svc.SendRequest(context.Background(), a, b, "")
	assertHTTPStatus(t, err, 403, "blocked")
}

func TestSendRequest_AlreadyFriends(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	seedFriendship(fs, a, b, models.FriendshipAccepted)
	svc, _ := newTestService(t, fs)
	_, err := svc.SendRequest(context.Background(), a, b, "")
	assertHTTPStatus(t, err, 409, "already_friends")
}

func TestSendRequest_DuplicateOutgoing(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	seedFriendship(fs, a, b, models.FriendshipPending)
	svc, _ := newTestService(t, fs)
	_, err := svc.SendRequest(context.Background(), a, b, "")
	assertHTTPStatus(t, err, 409, "request_exists")
}

func TestSendRequest_IncomingExists(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	seedFriendship(fs, b, a, models.FriendshipPending) // b already requested a
	svc, _ := newTestService(t, fs)
	_, err := svc.SendRequest(context.Background(), a, b, "")
	assertHTTPStatus(t, err, 409, "incoming_request_exists")
}

func TestSendRequest_Success(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	svc, fc := newTestService(t, fs)

	// Warm the cache so we can prove the write invalidates it.
	fc.SetFriendList(context.Background(), a, []FriendSummary{})
	fc.SetIncomingCount(context.Background(), b, 0)

	resp, err := svc.SendRequest(context.Background(), a, b, "  let's connect  ")
	require.NoError(t, err)
	require.Equal(t, b, resp.User.ID)
	require.Len(t, fs.friendships, 1)
	// The message is trimmed and persisted on the new pending row.
	for _, f := range fs.friendships {
		require.Equal(t, "let's connect", f.Message)
	}

	_, ok := fc.GetFriendList(context.Background(), a)
	require.False(t, ok, "sender friend list cache should be invalidated")
	_, ok = fc.GetIncomingCount(context.Background(), b)
	require.False(t, ok, "addressee incoming count cache should be invalidated")
}

func TestAccept_NotAddressee(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	id := seedFriendship(fs, a, b, models.FriendshipPending)
	svc, _ := newTestService(t, fs)
	// a is the requester, not the addressee, so a cannot accept.
	err := svc.AcceptRequest(context.Background(), a, id)
	assertHTTPStatus(t, err, 403, "not_addressee")
}

func TestAccept_Success(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	id := seedFriendship(fs, a, b, models.FriendshipPending)
	svc, _ := newTestService(t, fs)
	require.NoError(t, svc.AcceptRequest(context.Background(), b, id))
	require.Equal(t, models.FriendshipAccepted, fs.friendships[id].Status)
	require.NotNil(t, fs.friendships[id].AcceptedAt)
}

func TestAccept_NotPending(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	id := seedFriendship(fs, a, b, models.FriendshipAccepted)
	svc, _ := newTestService(t, fs)
	err := svc.AcceptRequest(context.Background(), b, id)
	assertHTTPStatus(t, err, 409, "not_pending")
}

func TestReject_ThirdParty(t *testing.T) {
	a, b, c := uuid.New(), uuid.New(), uuid.New()
	fs := newFakeStore(a, b, c)
	id := seedFriendship(fs, a, b, models.FriendshipPending)
	svc, _ := newTestService(t, fs)
	err := svc.RejectRequest(context.Background(), c, id)
	assertHTTPStatus(t, err, 403, "not_a_party")
}

func TestReject_Success(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	id := seedFriendship(fs, a, b, models.FriendshipPending)
	svc, _ := newTestService(t, fs)
	require.NoError(t, svc.RejectRequest(context.Background(), b, id))
	require.Empty(t, fs.friendships)
}

func TestRemoveFriend_NotFriends(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	svc, _ := newTestService(t, fs)
	err := svc.RemoveFriend(context.Background(), a, b)
	assertHTTPStatus(t, err, 404, "not_friends")
}

func TestBlock_RemovesFriendship(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	seedFriendship(fs, a, b, models.FriendshipAccepted)
	svc, _ := newTestService(t, fs)

	require.NoError(t, svc.Block(context.Background(), a, b))
	require.Empty(t, fs.friendships, "block should remove the friendship")
	blocked, _ := fs.IsBlockedEitherWay(context.Background(), a, b)
	require.True(t, blocked)
}

func TestBlock_Self(t *testing.T) {
	a := uuid.New()
	svc, _ := newTestService(t, newFakeStore(a))
	err := svc.Block(context.Background(), a, a)
	assertHTTPStatus(t, err, 400, "self_block")
}

func TestUnblock_NotBlocked(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	svc, _ := newTestService(t, newFakeStore(a, b))
	err := svc.Unblock(context.Background(), a, b)
	assertHTTPStatus(t, err, 404, "not_blocked")
}

func TestListFriends_ServedFromCache(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	fs := newFakeStore(a, b)
	fs.failListAccepted = true // store must not be hit on a cache hit
	svc, fc := newTestService(t, fs)

	cached := []FriendSummary{{User: UserSummary{ID: b, DisplayName: "Bob"}, FriendsSince: time.Now()}}
	fc.SetFriendList(context.Background(), a, cached)

	got, err := svc.ListFriends(context.Background(), a)
	require.NoError(t, err)
	require.Len(t, got, 1)
	require.Equal(t, b, got[0].User.ID)
}
