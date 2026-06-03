package friend

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/httperr"
)

// store is the data access the service needs; satisfied by *Repository and by
// mocks in tests.
type store interface {
	UserExists(ctx context.Context, id uuid.UUID) (bool, error)
	GetFriendship(ctx context.Context, a, b uuid.UUID) (*models.Friendship, error)
	GetFriendshipByID(ctx context.Context, id uuid.UUID) (*models.Friendship, error)
	CreateFriendship(ctx context.Context, f *models.Friendship) error
	CreateFriendshipUnlessBlocked(ctx context.Context, f *models.Friendship) error
	AcceptFriendship(ctx context.Context, id, addresseeID uuid.UUID, at time.Time) (int64, error)
	DeleteFriendship(ctx context.Context, id uuid.UUID) error
	DeleteFriendshipBetween(ctx context.Context, a, b uuid.UUID) (int64, error)
	ListAcceptedFriendships(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error)
	LanguagesByUsers(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID][]string, error)
	ListPendingIncoming(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error)
	ListPendingOutgoing(ctx context.Context, userID uuid.UUID) ([]models.Friendship, error)
	CountPendingIncoming(ctx context.Context, userID uuid.UUID) (int64, error)
	IsBlockedEitherWay(ctx context.Context, a, b uuid.UUID) (bool, error)
	BlockUser(ctx context.Context, blocker, blocked uuid.UUID) error
	Unblock(ctx context.Context, blocker, blocked uuid.UUID) (int64, error)
	ListBlocked(ctx context.Context, blocker uuid.UUID) ([]models.User, error)
}

// Service implements the friend feature's business rules.
type Service struct {
	store store
	cache *Cache
}

// NewService builds a Service. cache may be nil to disable caching.
func NewService(store store, cache *Cache) *Service {
	return &Service{store: store, cache: cache}
}

// SendRequest creates a pending friend request from requester to addressee,
// with an optional short message.
func (s *Service) SendRequest(ctx context.Context, requesterID, addresseeID uuid.UUID, message string) (*RequestSummary, error) {
	message = strings.TrimSpace(message)
	if requesterID == addresseeID {
		return nil, httperr.BadRequest("self_request", "you cannot send a friend request to yourself")
	}

	exists, err := s.store.UserExists(ctx, addresseeID)
	if err != nil {
		return nil, httperr.Internal("could not verify user").Wrap(err)
	}
	if !exists {
		return nil, httperr.NotFound("user_not_found", "user not found")
	}

	blocked, err := s.store.IsBlockedEitherWay(ctx, requesterID, addresseeID)
	if err != nil {
		return nil, httperr.Internal("could not check block").Wrap(err)
	}
	if blocked {
		return nil, httperr.Forbidden("blocked", "you cannot send a request to this user")
	}

	if existing, err := s.store.GetFriendship(ctx, requesterID, addresseeID); err == nil {
		switch {
		case existing.Status == models.FriendshipAccepted:
			return nil, httperr.Conflict("already_friends", "you are already friends with this user")
		case existing.RequesterID == requesterID:
			return nil, httperr.Conflict("request_exists", "a friend request is already pending")
		default:
			return nil, httperr.Conflict("incoming_request_exists", "this user already sent you a request; accept it instead")
		}
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, httperr.Internal("could not check existing relationship").Wrap(err)
	}

	f := &models.Friendship{
		ID:          uuid.New(),
		RequesterID: requesterID,
		AddresseeID: addresseeID,
		Status:      models.FriendshipPending,
		Message:     message,
	}
	// The block check above is a fast/friendly path; this insert re-checks the
	// block while holding row locks on the pair, so a block committing
	// concurrently cannot leave a stray pending request behind.
	if err := s.store.CreateFriendshipUnlessBlocked(ctx, f); err != nil {
		switch {
		case errors.Is(err, ErrBlocked):
			return nil, httperr.Forbidden("blocked", "you cannot send a request to this user")
		case errors.Is(err, gorm.ErrDuplicatedKey):
			return nil, httperr.Conflict("request_exists", "a relationship with this user already exists")
		default:
			return nil, httperr.Internal("could not create request").Wrap(err)
		}
	}

	s.cache.InvalidatePair(ctx, requesterID, addresseeID)

	return &RequestSummary{
		RequestID: f.ID,
		User:      UserSummary{ID: addresseeID},
		CreatedAt: time.Now(),
	}, nil
}

// AcceptRequest accepts a pending request that is addressed to userID.
func (s *Service) AcceptRequest(ctx context.Context, userID, requestID uuid.UUID) error {
	f, err := s.loadPendingForAddressee(ctx, userID, requestID)
	if err != nil {
		return err
	}
	// Compare-and-set: only flip the row if it is still pending and addressed
	// to this user. This closes the TOCTOU between the load above and the
	// update — a concurrent accept/reject/cancel makes RowsAffected 0 rather
	// than letting two operations both "succeed".
	n, err := s.store.AcceptFriendship(ctx, f.ID, userID, time.Now())
	if err != nil {
		return httperr.Internal("could not accept request").Wrap(err)
	}
	if n == 0 {
		return httperr.Conflict("not_pending", "this request is no longer pending")
	}
	s.cache.InvalidatePair(ctx, f.RequesterID, f.AddresseeID)
	return nil
}

// RejectRequest deletes a pending request. The caller may be the addressee
// (decline) or the requester (cancel).
func (s *Service) RejectRequest(ctx context.Context, userID, requestID uuid.UUID) error {
	f, err := s.store.GetFriendshipByID(ctx, requestID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return httperr.NotFound("request_not_found", "friend request not found")
		}
		return httperr.Internal("could not load request").Wrap(err)
	}
	if f.Status != models.FriendshipPending {
		return httperr.Conflict("not_pending", "this request is no longer pending")
	}
	if f.AddresseeID != userID && f.RequesterID != userID {
		return httperr.Forbidden("not_a_party", "you are not part of this request")
	}
	if err := s.store.DeleteFriendship(ctx, f.ID); err != nil {
		return httperr.Internal("could not delete request").Wrap(err)
	}
	s.cache.InvalidatePair(ctx, f.RequesterID, f.AddresseeID)
	return nil
}

// RemoveFriend deletes an accepted friendship between the two users.
func (s *Service) RemoveFriend(ctx context.Context, userID, otherID uuid.UUID) error {
	f, err := s.store.GetFriendship(ctx, userID, otherID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return httperr.NotFound("not_friends", "you are not friends with this user")
		}
		return httperr.Internal("could not load relationship").Wrap(err)
	}
	if f.Status != models.FriendshipAccepted {
		return httperr.NotFound("not_friends", "you are not friends with this user")
	}
	if err := s.store.DeleteFriendship(ctx, f.ID); err != nil {
		return httperr.Internal("could not remove friend").Wrap(err)
	}
	s.cache.InvalidatePair(ctx, userID, otherID)
	return nil
}

// Block blocks the target user, removing any existing relationship.
func (s *Service) Block(ctx context.Context, userID, targetID uuid.UUID) error {
	if userID == targetID {
		return httperr.BadRequest("self_block", "you cannot block yourself")
	}
	exists, err := s.store.UserExists(ctx, targetID)
	if err != nil {
		return httperr.Internal("could not verify user").Wrap(err)
	}
	if !exists {
		return httperr.NotFound("user_not_found", "user not found")
	}
	if err := s.store.BlockUser(ctx, userID, targetID); err != nil {
		return httperr.Internal("could not block user").Wrap(err)
	}
	s.cache.InvalidatePair(ctx, userID, targetID)
	return nil
}

// Unblock removes a block the user previously created.
func (s *Service) Unblock(ctx context.Context, userID, targetID uuid.UUID) error {
	n, err := s.store.Unblock(ctx, userID, targetID)
	if err != nil {
		return httperr.Internal("could not unblock user").Wrap(err)
	}
	if n == 0 {
		return httperr.NotFound("not_blocked", "this user is not blocked")
	}
	s.cache.InvalidatePair(ctx, userID, targetID)
	return nil
}

// ListFriends returns the user's accepted friends, served from cache when warm.
func (s *Service) ListFriends(ctx context.Context, userID uuid.UUID) ([]FriendSummary, error) {
	if cached, ok := s.cache.GetFriendList(ctx, userID); ok {
		return cached, nil
	}

	rows, err := s.store.ListAcceptedFriendships(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load friends").Wrap(err)
	}

	out := make([]FriendSummary, 0, len(rows))
	ids := make([]uuid.UUID, 0, len(rows))
	for i := range rows {
		other := otherParty(&rows[i], userID)
		if other == nil {
			continue
		}
		since := rows[i].CreatedAt
		if rows[i].AcceptedAt != nil {
			since = *rows[i].AcceptedAt
		}
		out = append(out, FriendSummary{User: userSummary(other), FriendsSince: since})
		ids = append(ids, other.ID)
	}

	// Attach each friend's languages so the list can be filtered by language.
	langsByUser, err := s.store.LanguagesByUsers(ctx, ids)
	if err != nil {
		return nil, httperr.Internal("could not load languages").Wrap(err)
	}
	for i := range out {
		out[i].User.Languages = langsByUser[out[i].User.ID]
	}

	s.cache.SetFriendList(ctx, userID, out)
	return out, nil
}

// ListIncomingRequests returns pending requests addressed to the user.
func (s *Service) ListIncomingRequests(ctx context.Context, userID uuid.UUID) ([]RequestSummary, error) {
	rows, err := s.store.ListPendingIncoming(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load requests").Wrap(err)
	}
	out := make([]RequestSummary, 0, len(rows))
	for i := range rows {
		if rows[i].Requester == nil {
			continue
		}
		out = append(out, RequestSummary{
			RequestID: rows[i].ID,
			User:      userSummary(rows[i].Requester),
			Message:   rows[i].Message,
			CreatedAt: rows[i].CreatedAt,
		})
	}
	return out, nil
}

// ListOutgoingRequests returns pending requests the user has sent.
func (s *Service) ListOutgoingRequests(ctx context.Context, userID uuid.UUID) ([]RequestSummary, error) {
	rows, err := s.store.ListPendingOutgoing(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load requests").Wrap(err)
	}
	out := make([]RequestSummary, 0, len(rows))
	for i := range rows {
		if rows[i].Addressee == nil {
			continue
		}
		out = append(out, RequestSummary{
			RequestID: rows[i].ID,
			User:      userSummary(rows[i].Addressee),
			CreatedAt: rows[i].CreatedAt,
		})
	}
	return out, nil
}

// IncomingRequestCount returns the pending-request count for badges, cached.
func (s *Service) IncomingRequestCount(ctx context.Context, userID uuid.UUID) (int64, error) {
	if n, ok := s.cache.GetIncomingCount(ctx, userID); ok {
		return n, nil
	}
	n, err := s.store.CountPendingIncoming(ctx, userID)
	if err != nil {
		return 0, httperr.Internal("could not count requests").Wrap(err)
	}
	s.cache.SetIncomingCount(ctx, userID, n)
	return n, nil
}

// ListBlocked returns the users the caller has blocked.
func (s *Service) ListBlocked(ctx context.Context, userID uuid.UUID) ([]UserSummary, error) {
	users, err := s.store.ListBlocked(ctx, userID)
	if err != nil {
		return nil, httperr.Internal("could not load blocked users").Wrap(err)
	}
	out := make([]UserSummary, 0, len(users))
	for i := range users {
		out = append(out, userSummary(&users[i]))
	}
	return out, nil
}

func (s *Service) loadPendingForAddressee(ctx context.Context, userID, requestID uuid.UUID) (*models.Friendship, error) {
	f, err := s.store.GetFriendshipByID(ctx, requestID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httperr.NotFound("request_not_found", "friend request not found")
		}
		return nil, httperr.Internal("could not load request").Wrap(err)
	}
	if f.Status != models.FriendshipPending {
		return nil, httperr.Conflict("not_pending", "this request is no longer pending")
	}
	if f.AddresseeID != userID {
		return nil, httperr.Forbidden("not_addressee", "only the recipient can accept this request")
	}
	return f, nil
}

func otherParty(f *models.Friendship, userID uuid.UUID) *models.User {
	if f.RequesterID == userID {
		return f.Addressee
	}
	return f.Requester
}
