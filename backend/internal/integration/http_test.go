package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/stretchr/testify/require"

	"github.com/cymed/chains/backend/internal/features/auth"
	"github.com/cymed/chains/backend/internal/features/friend"
	"github.com/cymed/chains/backend/internal/platform/config"
	"github.com/cymed/chains/backend/internal/server"
	"github.com/cymed/chains/backend/internal/testutil"
)

func newTestServer(t *testing.T) *echo.Echo {
	t.Helper()
	db := freshDB(t)
	cfg := &config.Config{
		AppEnv:      "test",
		JWTSecret:   "test-secret",
		JWTTTL:      time.Hour,
		CORSOrigins: []string{"*"},
		CacheTTL:    time.Minute,
	}
	return server.New(cfg, db, testutil.NewRedis(t))
}

type apiClient struct {
	t     *testing.T
	e     *echo.Echo
	token string
}

func (c *apiClient) do(method, path string, body any) *httptest.ResponseRecorder {
	c.t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(c.t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	if c.token != "" {
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+c.token)
	}
	rec := httptest.NewRecorder()
	c.e.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), "body: %s", rec.Body.String())
	return out
}

func register(t *testing.T, e *echo.Echo, email, name string) *apiClient {
	t.Helper()
	c := &apiClient{t: t, e: e}
	username := strings.SplitN(email, "@", 2)[0] // unique handle per test
	rec := c.do(http.MethodPost, "/api/auth/register", echo.Map{
		"email": email, "username": username, "password": "supersecret", "display_name": name,
	})
	require.Equal(t, http.StatusCreated, rec.Code, "register body: %s", rec.Body.String())
	c.token = decode[auth.AuthResponse](t, rec).Token
	return c
}

type friendsResp struct {
	Friends []friend.FriendSummary `json:"friends"`
}

type requestsResp struct {
	Requests []friend.RequestSummary `json:"requests"`
}

func TestHTTP_BodyLimitRejectsOversizedRequest(t *testing.T) {
	e := newTestServer(t)

	// 5 MiB exceeds the 4 MiB global body limit.
	big := bytes.Repeat([]byte("a"), 5<<20)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/register", bytes.NewReader(big))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code, "body: %s", rec.Body.String())
}

func TestHTTP_ReadinessProbe(t *testing.T) {
	e := newTestServer(t)

	// Liveness never touches dependencies.
	req := httptest.NewRequest(http.MethodGet, "/livez", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	// Readiness pings DB + cache, both up in the test harness.
	req = httptest.NewRequest(http.MethodGet, "/readyz", nil)
	rec = httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code, "body: %s", rec.Body.String())
	require.Contains(t, rec.Body.String(), "\"database\":\"ok\"")
	require.Contains(t, rec.Body.String(), "\"cache\":\"ok\"")
}

func TestHTTP_SecurityHeadersPresent(t *testing.T) {
	e := newTestServer(t)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	require.Equal(t, "DENY", rec.Header().Get("X-Frame-Options"))
	require.Equal(t, "no-referrer", rec.Header().Get("Referrer-Policy"))
	require.NotEmpty(t, rec.Header().Get("Content-Security-Policy"))
}

func TestHTTP_NetworkGraph(t *testing.T) {
	e := newTestServer(t)
	alice := register(t, e, "alice@example.com", "Alice")
	bob := register(t, e, "bob@example.com", "Bob")
	register(t, e, "carol@example.com", "Carol") // unconnected node

	bobID := decode[auth.AuthResponse](t, alice.do(http.MethodPost, "/api/auth/login", echo.Map{
		"email": "bob@example.com", "password": "supersecret",
	})).User.ID
	aliceID := decode[auth.AuthResponse](t, alice.do(http.MethodPost, "/api/auth/login", echo.Map{
		"email": "alice@example.com", "password": "supersecret",
	})).User.ID

	// Make Alice and Bob friends.
	alice.do(http.MethodPost, "/api/friends/requests", echo.Map{"addressee_id": bobID})
	reqID := decode[requestsResp](t, bob.do(http.MethodGet, "/api/friends/requests/incoming", nil)).Requests[0].RequestID
	bob.do(http.MethodPost, "/api/friends/requests/"+reqID.String()+"/accept", nil)

	type node struct {
		ID          string `json:"id"`
		DisplayName string `json:"display_name"`
	}
	type link struct {
		Source string `json:"source"`
		Target string `json:"target"`
	}
	graph := decode[struct {
		Nodes     []node `json:"nodes"`
		Links     []link `json:"links"`
		Truncated bool   `json:"truncated"`
	}](t, alice.do(http.MethodGet, "/api/network", nil))

	require.Len(t, graph.Nodes, 3, "all three users are nodes")
	require.False(t, graph.Truncated)
	require.Len(t, graph.Links, 1, "only the accepted Alice-Bob edge")

	endpoints := []string{graph.Links[0].Source, graph.Links[0].Target}
	require.ElementsMatch(t, []string{aliceID.String(), bobID.String()}, endpoints)

	// Nodes must never leak email.
	for _, n := range graph.Nodes {
		require.NotContains(t, n.DisplayName, "@", "display name shown, not email")
	}
}

func TestHTTP_ProfileUpdateAndPublicView(t *testing.T) {
	e := newTestServer(t)
	alice := register(t, e, "alice@example.com", "Alice")
	bob := register(t, e, "bob@example.com", "Bob")
	aliceID := decode[auth.AuthResponse](t, alice.do(http.MethodPost, "/api/auth/login", echo.Map{
		"email": "alice@example.com", "password": "supersecret",
	})).User.ID

	type linkVisibility struct {
		XHandle      string `json:"x_handle"`
		PortfolioURL string `json:"portfolio_url"`
	}
	type profileResp struct {
		ID             string          `json:"id"`
		Username       string          `json:"username"`
		DisplayName    string          `json:"display_name"`
		JobTitle       string          `json:"job_title"`
		StatusMessage  string          `json:"status_message"`
		XHandle        string          `json:"x_handle"`
		GithubHandle   string          `json:"github_handle"`
		ZennHandle     string          `json:"zenn_handle"`
		LinkedinURL    string          `json:"linkedin_url"`
		PortfolioURL   string          `json:"portfolio_url"`
		Languages      []string        `json:"languages"`
		LinkVisibility *linkVisibility `json:"link_visibility"`
		Age            *int            `json:"age"`
		BirthDate      *string         `json:"birth_date"`
	}

	// Alice edits her profile; a leading @ on handles is stripped, and a
	// duplicate language (case-insensitive) is collapsed while order is kept.
	// Her birth date is set but the date itself stays private (show_age only).
	// Her X handle is public, GitHub is private, and the rest default to
	// friends-only.
	rec := alice.do(http.MethodPut, "/api/me/profile", echo.Map{
		"display_name":             "Alice A.",
		"job_title":                "Staff Engineer",
		"status_message":           "shipping things",
		"x_handle":                 "@alice_x",
		"github_handle":            "alicehub",
		"zenn_handle":              "alice_z",
		"linkedin_url":             "https://linkedin.com/in/alice",
		"portfolio_url":            "https://alice.dev",
		"languages":                []string{"Go", "TypeScript", "go", "C++"},
		"birth_date":               "1990-01-01",
		"show_age":                 true,
		"show_birth_date":          false,
		"x_handle_visibility":      "public",
		"github_handle_visibility": "private",
	})
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	updated := decode[profileResp](t, rec)
	require.Equal(t, "alice_x", updated.XHandle, "leading @ stripped")
	require.Equal(t, "Alice A.", updated.DisplayName)
	require.Equal(t, []string{"Go", "TypeScript", "C++"}, updated.Languages, "dedup case-insensitively, order kept")
	require.NotNil(t, updated.BirthDate, "owner sees their own birth date")
	require.NotNil(t, updated.LinkVisibility, "owner gets their per-link visibility")
	require.Equal(t, "public", updated.LinkVisibility.XHandle)
	require.Equal(t, "friends", updated.LinkVisibility.PortfolioURL, "unspecified visibility defaults to friends")

	// Bob views Alice's public profile by id (no email field present). Bob is
	// not Alice's friend, so friends-only and private links are hidden, but the
	// public X handle and general fields (job, status, languages, age) remain.
	rec = bob.do(http.MethodGet, "/api/users/"+aliceID.String(), nil)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NotContains(t, rec.Body.String(), "\"email\"", "public profile must not leak email")
	pub := decode[profileResp](t, rec)
	require.Equal(t, "Staff Engineer", pub.JobTitle)
	require.Equal(t, "shipping things", pub.StatusMessage)
	require.Nil(t, pub.LinkVisibility, "non-owners do not receive visibility levels")
	require.Equal(t, "alice_x", pub.XHandle, "public link visible to non-friends")
	require.Empty(t, pub.PortfolioURL, "friends-only link hidden from non-friends")
	require.Empty(t, pub.GithubHandle, "private link hidden from non-friends")
	require.Equal(t, []string{"Go", "TypeScript", "C++"}, pub.Languages)
	require.NotNil(t, pub.Age, "age is visible (show_age)")
	require.Nil(t, pub.BirthDate, "exact birth date stays private to others")

	// Once Alice and Bob are friends, Bob can see Alice's friends-only links,
	// but the private GitHub handle stays hidden.
	bobID := decode[auth.AuthResponse](t, bob.do(http.MethodPost, "/api/auth/login", echo.Map{
		"email": "bob@example.com", "password": "supersecret",
	})).User.ID
	rec = alice.do(http.MethodPost, "/api/friends/requests", echo.Map{"addressee_id": bobID})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	inc := decode[requestsResp](t, bob.do(http.MethodGet, "/api/friends/requests/incoming", nil))
	require.Len(t, inc.Requests, 1)
	rec = bob.do(http.MethodPost, "/api/friends/requests/"+inc.Requests[0].RequestID.String()+"/accept", nil)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	friendView := decode[profileResp](t, bob.do(http.MethodGet, "/api/users/"+aliceID.String(), nil))
	require.Equal(t, "https://alice.dev", friendView.PortfolioURL, "friends see friends-only links")
	require.Empty(t, friendView.GithubHandle, "private link stays hidden even from friends")

	// The QR/add-by-username lookup resolves the same profile.
	byName := decode[profileResp](t, bob.do(http.MethodGet, "/api/users/by-username/"+pub.Username, nil))
	require.Equal(t, aliceID.String(), byName.ID)
	require.Equal(t, "https://alice.dev", byName.PortfolioURL, "friend sees friends-only links via username lookup too")

	// Invalid handle is rejected.
	rec = alice.do(http.MethodPut, "/api/me/profile", echo.Map{
		"display_name": "Alice", "x_handle": "bad handle!",
	})
	require.Equal(t, http.StatusBadRequest, rec.Code)

	// Unknown user id is a 404.
	rec = bob.do(http.MethodGet, "/api/users/"+uuid.NewString(), nil)
	require.Equal(t, http.StatusNotFound, rec.Code)
}

func TestHTTP_FriendRequestLifecycle(t *testing.T) {
	e := newTestServer(t)
	alice := register(t, e, "alice@example.com", "Alice")
	bob := register(t, e, "bob@example.com", "Bob")
	bobID := decode[auth.AuthResponse](t, alice.do(http.MethodPost, "/api/auth/login", echo.Map{
		"email": "bob@example.com", "password": "supersecret",
	})).User.ID

	// Alice sends a request to Bob.
	rec := alice.do(http.MethodPost, "/api/friends/requests", echo.Map{"addressee_id": bobID})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())

	// Bob sees one incoming request and a badge count of 1.
	inc := decode[requestsResp](t, bob.do(http.MethodGet, "/api/friends/requests/incoming", nil))
	require.Len(t, inc.Requests, 1)
	require.Equal(t, "Alice", inc.Requests[0].User.DisplayName)
	requestID := inc.Requests[0].RequestID

	count := decode[struct {
		Count int64 `json:"count"`
	}](t, bob.do(http.MethodGet, "/api/friends/requests/incoming/count", nil))
	require.Equal(t, int64(1), count.Count)

	// Bob accepts.
	rec = bob.do(http.MethodPost, "/api/friends/requests/"+requestID.String()+"/accept", nil)
	require.Equal(t, http.StatusNoContent, rec.Code, rec.Body.String())

	// Both now see each other as friends.
	aliceFriends := decode[friendsResp](t, alice.do(http.MethodGet, "/api/friends", nil))
	require.Len(t, aliceFriends.Friends, 1)
	require.Equal(t, "Bob", aliceFriends.Friends[0].User.DisplayName)

	bobFriends := decode[friendsResp](t, bob.do(http.MethodGet, "/api/friends", nil))
	require.Len(t, bobFriends.Friends, 1)
	require.Equal(t, "Alice", bobFriends.Friends[0].User.DisplayName)

	// Alice removes Bob; her friend list is empty again (cache invalidated).
	rec = alice.do(http.MethodDelete, "/api/friends/"+bobID.String(), nil)
	require.Equal(t, http.StatusNoContent, rec.Code)
	aliceFriends = decode[friendsResp](t, alice.do(http.MethodGet, "/api/friends", nil))
	require.Empty(t, aliceFriends.Friends)
}

func TestHTTP_BlockPreventsRequest(t *testing.T) {
	e := newTestServer(t)
	alice := register(t, e, "alice@example.com", "Alice")
	register(t, e, "bob@example.com", "Bob")
	bobID := decode[auth.AuthResponse](t, alice.do(http.MethodPost, "/api/auth/login", echo.Map{
		"email": "bob@example.com", "password": "supersecret",
	})).User.ID

	rec := alice.do(http.MethodPost, "/api/blocks", echo.Map{"user_id": bobID})
	require.Equal(t, http.StatusNoContent, rec.Code)

	rec = alice.do(http.MethodPost, "/api/friends/requests", echo.Map{"addressee_id": bobID})
	require.Equal(t, http.StatusForbidden, rec.Code, rec.Body.String())

	// Unblock then the request succeeds.
	rec = alice.do(http.MethodDelete, "/api/blocks/"+bobID.String(), nil)
	require.Equal(t, http.StatusNoContent, rec.Code)
	rec = alice.do(http.MethodPost, "/api/friends/requests", echo.Map{"addressee_id": bobID})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
}

func TestHTTP_RequiresAuth(t *testing.T) {
	e := newTestServer(t)
	anon := &apiClient{t: t, e: e}
	rec := anon.do(http.MethodGet, "/api/friends", nil)
	require.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestHTTP_UserSearch(t *testing.T) {
	e := newTestServer(t)
	alice := register(t, e, "alice@example.com", "Alice")
	register(t, e, "bobby@example.com", "Bobby")

	results := decode[struct {
		Results []friend.UserSummary `json:"results"`
	}](t, alice.do(http.MethodGet, "/api/users/search?q=bob", nil))
	require.Len(t, results.Results, 1)
	require.Equal(t, "Bobby", results.Results[0].DisplayName)

	// Search excludes the caller.
	selfSearch := decode[struct {
		Results []friend.UserSummary `json:"results"`
	}](t, alice.do(http.MethodGet, "/api/users/search?q=alice", nil))
	require.Empty(t, selfSearch.Results)
}

func TestHTTP_CannotFriendYourself(t *testing.T) {
	e := newTestServer(t)
	alice := register(t, e, "alice@example.com", "Alice")
	selfID := decode[auth.AuthResponse](t, alice.do(http.MethodPost, "/api/auth/login", echo.Map{
		"email": "alice@example.com", "password": "supersecret",
	})).User.ID

	rec := alice.do(http.MethodPost, "/api/friends/requests", echo.Map{"addressee_id": selfID})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
}
