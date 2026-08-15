package recommendation

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/cymed/chains/backend/internal/models"
)

// fakeStore is an in-memory graph for exercising the ranking without a DB.
type fakeStore struct {
	friends  map[uuid.UUID][]uuid.UUID // accepted friendships (symmetric)
	excluded map[uuid.UUID][]uuid.UUID
	langs    map[uuid.UUID][]string
	names    map[uuid.UUID]string
}

func (f *fakeStore) AcceptedFriendIDs(_ context.Context, id uuid.UUID) ([]uuid.UUID, error) {
	return f.friends[id], nil
}

func (f *fakeStore) AcceptedEdges(_ context.Context) ([]edge, error) {
	var edges []edge
	seen := map[string]bool{}
	for a, ns := range f.friends {
		for _, b := range ns {
			key := a.String() + b.String()
			rev := b.String() + a.String()
			if seen[key] || seen[rev] {
				continue
			}
			seen[key] = true
			edges = append(edges, edge{Source: a, Target: b})
		}
	}
	return edges, nil
}

func (f *fakeStore) ExcludedIDs(_ context.Context, id uuid.UUID) ([]uuid.UUID, error) {
	return f.excluded[id], nil
}

func (f *fakeStore) UsersByIDs(_ context.Context, ids []uuid.UUID) ([]models.User, error) {
	out := make([]models.User, 0, len(ids))
	for _, id := range ids {
		out = append(out, models.User{ID: id, DisplayName: f.names[id], Username: f.names[id]})
	}
	return out, nil
}

func (f *fakeStore) LanguagesByUsers(_ context.Context, ids []uuid.UUID) (map[uuid.UUID][]string, error) {
	out := map[uuid.UUID][]string{}
	for _, id := range ids {
		out[id] = f.langs[id]
	}
	return out, nil
}

func (f *fakeStore) LanguagesFor(_ context.Context, id uuid.UUID) ([]string, error) {
	return f.langs[id], nil
}

func link(m map[uuid.UUID][]uuid.UUID, a, b uuid.UUID) {
	m[a] = append(m[a], b)
	m[b] = append(m[b], a)
}

func TestRecommendRanksByMutualThenSharedLanguages(t *testing.T) {
	me := uuid.New()
	f1, f2 := uuid.New(), uuid.New() // my friends
	// fofA is friends with both f1 and f2 (2 mutual); fofB only with f1 (1 mutual).
	fofA, fofB := uuid.New(), uuid.New()

	friends := map[uuid.UUID][]uuid.UUID{}
	link(friends, me, f1)
	link(friends, me, f2)
	link(friends, f1, fofA)
	link(friends, f2, fofA)
	link(friends, f1, fofB)

	store := &fakeStore{
		friends:  friends,
		excluded: map[uuid.UUID][]uuid.UUID{},
		langs: map[uuid.UUID][]string{
			me:   {"Go", "TypeScript"},
			fofA: {"Python"},           // no shared language
			fofB: {"Go", "TypeScript"}, // 2 shared
		},
		names: map[uuid.UUID]string{fofA: "Aoki", fofB: "Baba"},
	}
	svc := NewService(store)

	recs, err := svc.Recommend(context.Background(), me, 10)
	require.NoError(t, err)
	require.Len(t, recs, 2)
	// fofA wins on mutual friends (2 vs 1) even though it shares no languages.
	assert.Equal(t, fofA, recs[0].User.ID)
	assert.Equal(t, 2, recs[0].MutualFriends)
	assert.Empty(t, recs[0].SharedLanguages)
	// fofB has the shared languages.
	assert.Equal(t, fofB, recs[1].User.ID)
	assert.Equal(t, 1, recs[1].MutualFriends)
	assert.Equal(t, []string{"Go", "TypeScript"}, recs[1].SharedLanguages)
}

func TestRecommendExcludesFriendsSelfAndBlocked(t *testing.T) {
	me := uuid.New()
	f1 := uuid.New()
	blocked := uuid.New()
	candidate := uuid.New()

	friends := map[uuid.UUID][]uuid.UUID{}
	link(friends, me, f1)
	link(friends, f1, blocked)   // a friend-of-friend, but blocked
	link(friends, f1, candidate) // a legitimate suggestion
	link(friends, f1, me)        // already covered, ensures self isn't suggested

	store := &fakeStore{
		friends:  friends,
		excluded: map[uuid.UUID][]uuid.UUID{me: {blocked}},
		langs:    map[uuid.UUID][]string{},
		names:    map[uuid.UUID]string{candidate: "C"},
	}
	svc := NewService(store)

	recs, err := svc.Recommend(context.Background(), me, 10)
	require.NoError(t, err)
	require.Len(t, recs, 1)
	assert.Equal(t, candidate, recs[0].User.ID)
}
