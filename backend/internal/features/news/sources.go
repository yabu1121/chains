package news

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// userAgent identifies chains to upstreams (GitHub rejects requests without one).
const userAgent = "chains-news/1.0 (+https://github.com/cymed/chains)"

// langTopic maps a canonical language to each upstream's idea of it. A language
// without an explicit entry falls back to sensible defaults (see topicFor).
type langTopic struct {
	zenn   string // Zenn topic slug
	qiita  string // Qiita tag
	hn     string // Hacker News search query
	github string // GitHub `language:` qualifier
}

var langTopics = map[string]langTopic{
	"Go":         {zenn: "go", qiita: "Go", hn: "golang", github: "Go"},
	"TypeScript": {zenn: "typescript", qiita: "TypeScript", hn: "typescript", github: "TypeScript"},
	"JavaScript": {zenn: "javascript", qiita: "JavaScript", hn: "javascript", github: "JavaScript"},
	"Python":     {zenn: "python", qiita: "Python", hn: "python", github: "Python"},
	"Rust":       {zenn: "rust", qiita: "Rust", hn: "rust", github: "Rust"},
	"Java":       {zenn: "java", qiita: "Java", hn: "java", github: "Java"},
	"Ruby":       {zenn: "ruby", qiita: "Ruby", hn: "ruby", github: "Ruby"},
	"PHP":        {zenn: "php", qiita: "PHP", hn: "php", github: "PHP"},
	"Swift":      {zenn: "swift", qiita: "Swift", hn: "swift", github: "Swift"},
	"Kotlin":     {zenn: "kotlin", qiita: "Kotlin", hn: "kotlin", github: "Kotlin"},
	"C#":         {zenn: "csharp", qiita: "C#", hn: "c#", github: "C#"},
	"C++":        {zenn: "cpp", qiita: "C++", hn: "c++", github: "C++"},
	"Dart":       {zenn: "dart", qiita: "Dart", hn: "dart", github: "Dart"},
	"Elixir":     {zenn: "elixir", qiita: "Elixir", hn: "elixir", github: "Elixir"},
	"Scala":      {zenn: "scala", qiita: "Scala", hn: "scala", github: "Scala"},
	"Haskell":    {zenn: "haskell", qiita: "Haskell", hn: "haskell", github: "Haskell"},
}

// topicFor returns the per-upstream identifiers for a canonical language.
func topicFor(lang string) langTopic {
	if t, ok := langTopics[lang]; ok {
		return t
	}
	lower := strings.ToLower(lang)
	return langTopic{zenn: lower, qiita: lang, hn: lang, github: lang}
}

// DefaultSources is the production set of upstreams, sharing one HTTP client.
func DefaultSources(client *http.Client) []Source {
	return []Source{
		&zennSource{client: client},
		&qiitaSource{client: client},
		&hackerNewsSource{client: client},
		&githubSource{client: client},
	}
}

// getBody issues a GET with the shared User-Agent and returns the response body,
// erroring on any non-2xx status.
func getBody(ctx context.Context, client *http.Client, rawURL string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json, application/atom+xml, application/rss+xml, */*")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s: unexpected status %d", rawURL, resp.StatusCode)
	}
	// Cap the body so a misbehaving upstream can't balloon memory.
	return io.ReadAll(io.LimitReader(resp.Body, 4<<20))
}

// --- Syndication (RSS 2.0 + Atom) ---------------------------------------------

// syndFeed captures both RSS 2.0 (channel>item) and Atom (feed>entry) so one
// decode handles either. encoding/xml fills whichever fields the root provides.
type syndFeed struct {
	Items   []rssItem   `xml:"channel>item"`
	Entries []atomEntry `xml:"entry"`
}

type rssItem struct {
	Title   string `xml:"title"`
	Link    string `xml:"link"`
	PubDate string `xml:"pubDate"`
	Creator string `xml:"creator"` // dc:creator
	Desc    string `xml:"description"`
}

type atomEntry struct {
	Title     string     `xml:"title"`
	Links     []atomLink `xml:"link"`
	Published string     `xml:"published"`
	Updated   string     `xml:"updated"`
	Author    struct {
		Name string `xml:"name"`
	} `xml:"author"`
	Summary string `xml:"summary"`
}

type atomLink struct {
	Href string `xml:"href,attr"`
	Rel  string `xml:"rel,attr"`
}

func (l atomEntry) href() string {
	for _, ln := range l.Links {
		if ln.Rel == "alternate" || ln.Rel == "" {
			return ln.Href
		}
	}
	if len(l.Links) > 0 {
		return l.Links[0].Href
	}
	return ""
}

// parseSyndication decodes an RSS/Atom body into articles attributed to source.
func parseSyndication(body []byte, source string) ([]Article, error) {
	var f syndFeed
	if err := xml.Unmarshal(body, &f); err != nil {
		return nil, err
	}
	out := make([]Article, 0, len(f.Items)+len(f.Entries))
	for _, it := range f.Items {
		out = append(out, Article{
			Title:       strings.TrimSpace(it.Title),
			URL:         strings.TrimSpace(it.Link),
			Source:      source,
			Author:      strings.TrimSpace(it.Creator),
			Summary:     trimSummary(it.Desc),
			PublishedAt: parseTime(it.PubDate),
		})
	}
	for _, e := range f.Entries {
		when := e.Published
		if when == "" {
			when = e.Updated
		}
		out = append(out, Article{
			Title:       strings.TrimSpace(e.Title),
			URL:         strings.TrimSpace(e.href()),
			Source:      source,
			Author:      strings.TrimSpace(e.Author.Name),
			Summary:     trimSummary(e.Summary),
			PublishedAt: parseTime(when),
		})
	}
	return out, nil
}

// timeLayouts covers the formats the upstreams emit (RFC1123 variants for RSS,
// RFC3339 for Atom/JSON).
var timeLayouts = []string{
	time.RFC1123Z,
	time.RFC1123,
	time.RFC3339,
	time.RFC3339Nano,
	"2006-01-02T15:04:05Z07:00",
}

func parseTime(raw string) time.Time {
	raw = strings.TrimSpace(raw)
	for _, layout := range timeLayouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

// trimSummary strips tags/whitespace and clips an overlong summary.
func trimSummary(s string) string {
	s = strings.TrimSpace(stripTags(s))
	const max = 280
	if len([]rune(s)) > max {
		s = string([]rune(s)[:max]) + "…"
	}
	return s
}

// stripTags removes a naive set of HTML tags from feed descriptions.
func stripTags(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// --- Zenn ---------------------------------------------------------------------

type zennSource struct{ client *http.Client }

func (s *zennSource) Name() string { return "Zenn" }

func (s *zennSource) Fetch(ctx context.Context, lang string) ([]Article, error) {
	u := "https://zenn.dev/feed"
	if lang != "" {
		u = fmt.Sprintf("https://zenn.dev/topics/%s/feed", url.PathEscape(topicFor(lang).zenn))
	}
	body, err := getBody(ctx, s.client, u)
	if err != nil {
		return nil, err
	}
	return parseSyndication(body, s.Name())
}

// --- Qiita --------------------------------------------------------------------

type qiitaSource struct{ client *http.Client }

func (s *qiitaSource) Name() string { return "Qiita" }

func (s *qiitaSource) Fetch(ctx context.Context, lang string) ([]Article, error) {
	// Qiita exposes a reliable per-tag Atom feed; there is no clean general feed,
	// so a language-less (general) request contributes nothing here.
	if lang == "" {
		return nil, nil
	}
	u := fmt.Sprintf("https://qiita.com/tags/%s/feed", url.PathEscape(topicFor(lang).qiita))
	body, err := getBody(ctx, s.client, u)
	if err != nil {
		return nil, err
	}
	return parseSyndication(body, s.Name())
}

// --- Hacker News (Algolia) ----------------------------------------------------

type hackerNewsSource struct{ client *http.Client }

func (s *hackerNewsSource) Name() string { return "Hacker News" }

type hnResponse struct {
	Hits []struct {
		Title     string `json:"title"`
		URL       string `json:"url"`
		Author    string `json:"author"`
		Points    int    `json:"points"`
		ObjectID  string `json:"objectID"`
		CreatedAt string `json:"created_at"`
	} `json:"hits"`
}

func (s *hackerNewsSource) Fetch(ctx context.Context, lang string) ([]Article, error) {
	var u string
	if lang == "" {
		u = "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=15"
	} else {
		q := url.QueryEscape(topicFor(lang).hn)
		u = fmt.Sprintf("https://hn.algolia.com/api/v1/search_by_date?query=%s&tags=story&hitsPerPage=15", q)
	}
	body, err := getBody(ctx, s.client, u)
	if err != nil {
		return nil, err
	}
	var parsed hnResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := make([]Article, 0, len(parsed.Hits))
	for _, h := range parsed.Hits {
		link := h.URL
		if link == "" && h.ObjectID != "" {
			// Self-posts (Ask/Show HN) have no external URL; link to the thread.
			link = "https://news.ycombinator.com/item?id=" + h.ObjectID
		}
		out = append(out, Article{
			Title:       strings.TrimSpace(h.Title),
			URL:         strings.TrimSpace(link),
			Source:      s.Name(),
			Author:      h.Author,
			PublishedAt: parseTime(h.CreatedAt),
		})
	}
	return out, nil
}

// --- GitHub (search) ----------------------------------------------------------

type githubSource struct{ client *http.Client }

func (s *githubSource) Name() string { return "GitHub" }

type ghResponse struct {
	Items []struct {
		FullName    string `json:"full_name"`
		HTMLURL     string `json:"html_url"`
		Description string `json:"description"`
		Stars       int    `json:"stargazers_count"`
		PushedAt    string `json:"pushed_at"`
		Owner       struct {
			Login string `json:"login"`
		} `json:"owner"`
	} `json:"items"`
}

func (s *githubSource) Fetch(ctx context.Context, lang string) ([]Article, error) {
	// "Trending" has no public API; the most-starred repos for a language is a
	// reasonable, stable proxy. There is no good language-less query, so a general
	// feed skips GitHub.
	if lang == "" {
		return nil, nil
	}
	q := url.QueryEscape("language:" + topicFor(lang).github)
	u := fmt.Sprintf("https://api.github.com/search/repositories?q=%s&sort=stars&order=desc&per_page=8", q)
	body, err := getBody(ctx, s.client, u)
	if err != nil {
		return nil, err
	}
	var parsed ghResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := make([]Article, 0, len(parsed.Items))
	for _, it := range parsed.Items {
		out = append(out, Article{
			Title:       it.FullName,
			URL:         strings.TrimSpace(it.HTMLURL),
			Source:      s.Name(),
			Author:      it.Owner.Login,
			Summary:     trimSummary(it.Description),
			PublishedAt: parseTime(it.PushedAt),
		})
	}
	return out, nil
}
