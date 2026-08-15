package news

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/cymed/chains/backend/internal/platform/cache"
)

// fakeSource records the languages it was asked for and returns canned articles.
type fakeSource struct {
	name     string
	calls    int32
	byLang   map[string][]Article
	general  []Article
	mu       sync.Mutex
	gotLangs []string
}

func (f *fakeSource) Name() string { return f.name }

func (f *fakeSource) Fetch(_ context.Context, lang string) ([]Article, error) {
	atomic.AddInt32(&f.calls, 1)
	f.mu.Lock()
	f.gotLangs = append(f.gotLangs, lang)
	f.mu.Unlock()
	if lang == "" {
		return f.general, nil
	}
	return f.byLang[lang], nil
}

func art(title, url string, when time.Time) Article {
	return Article{Title: title, URL: url, PublishedAt: when}
}

func TestFeedDedupesAndSortsByRecency(t *testing.T) {
	now := time.Now().UTC()
	src := &fakeSource{
		name: "Fake",
		byLang: map[string][]Article{
			"Go": {
				art("old", "https://a", now.Add(-2*time.Hour)),
				art("new", "https://b", now.Add(-1*time.Minute)),
				art("dup", "https://a", now), // same URL as "old" -> dropped
			},
		},
	}
	svc := newServiceWithSources(nil, cache.NewMemory(), []Source{src})

	resp, err := svc.feed(context.Background(), []string{"Go"})
	require.NoError(t, err)
	require.Len(t, resp.Articles, 2, "duplicate URL should be removed")
	assert.Equal(t, "new", resp.Articles[0].Title, "most recent first")
	assert.Equal(t, "old", resp.Articles[1].Title)
	assert.Equal(t, "Go", resp.Articles[0].Language, "articles are tagged with their language")
}

func TestFeedIsCached(t *testing.T) {
	src := &fakeSource{
		name:   "Fake",
		byLang: map[string][]Article{"Go": {art("x", "https://x", time.Now())}},
	}
	svc := newServiceWithSources(nil, cache.NewMemory(), []Source{src})

	_, err := svc.feed(context.Background(), []string{"Go"})
	require.NoError(t, err)
	_, err = svc.feed(context.Background(), []string{"Go"})
	require.NoError(t, err)

	assert.Equal(t, int32(1), atomic.LoadInt32(&src.calls), "second call should be served from cache")
}

func TestGeneralFeedUsesEmptyLanguage(t *testing.T) {
	src := &fakeSource{
		name:    "Fake",
		general: []Article{art("front", "https://front", time.Now())},
	}
	svc := newServiceWithSources(nil, cache.NewMemory(), []Source{src})

	resp, err := svc.feed(context.Background(), nil)
	require.NoError(t, err)
	require.Len(t, resp.Articles, 1)
	assert.Equal(t, []string{""}, src.gotLangs, "no languages -> a single general fetch")
	assert.Empty(t, resp.Languages)
}

func TestFeedForRejectsUnknownLanguage(t *testing.T) {
	svc := newServiceWithSources(nil, cache.NewMemory(), []Source{})
	_, err := svc.FeedFor(context.Background(), uuid.Nil, "Klingon")
	require.Error(t, err)
}

func TestNormaliseLangsCanonicalisesDedupesAndCaps(t *testing.T) {
	out := normaliseLangs([]string{"go", "Go", "typescript", "rust", "python", "java", "ruby"})
	// "go"/"Go" collapse to one; capped at maxFeedLangs.
	assert.Equal(t, []string{"Go", "TypeScript", "Rust", "Python", "Java"}, out)
}

func TestParseSyndicationHandlesRSSAndAtom(t *testing.T) {
	rss := []byte(`<rss><channel>
		<item><title>RSS post</title><link>https://r/1</link>
		<pubDate>Mon, 02 Jan 2006 15:04:05 +0000</pubDate></item>
	</channel></rss>`)
	got, err := parseSyndication(rss, "Zenn")
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "RSS post", got[0].Title)
	assert.Equal(t, "https://r/1", got[0].URL)
	assert.False(t, got[0].PublishedAt.IsZero())

	atom := []byte(`<feed xmlns="http://www.w3.org/2005/Atom">
		<entry><title>Atom post</title>
		<link rel="alternate" href="https://a/1"/>
		<published>2026-01-02T15:04:05Z</published>
		<author><name>catnose</name></author></entry>
	</feed>`)
	got, err = parseSyndication(atom, "Qiita")
	require.NoError(t, err)
	require.Len(t, got, 1)
	assert.Equal(t, "Atom post", got[0].Title)
	assert.Equal(t, "https://a/1", got[0].URL)
	assert.Equal(t, "catnose", got[0].Author)
}
