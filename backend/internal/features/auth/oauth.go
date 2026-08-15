package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
	"gorm.io/gorm"

	"github.com/cymed/chains/backend/internal/models"
	"github.com/cymed/chains/backend/internal/platform/cache"
	"github.com/cymed/chains/backend/internal/platform/httperr"
)

// OAuth login flow (GitHub, Google).
//
// We use the server-side authorization-code flow because auth lives in
// httpOnly cookies: the browser never sees a token. The sequence is
//
//	1. GET  /api/auth/oauth/<provider>/start
//	     → we mint a random `state`, remember it in the cache, and 302 the
//	       browser to the provider's consent screen.
//	2. provider redirects back to
//	   GET /api/auth/oauth/<provider>/callback?code=...&state=...
//	     → we verify `state`, exchange `code` for a provider token, fetch the
//	       user's profile, find-or-create the chains account, set the auth
//	       cookies, and 302 the browser back to the frontend.
//
// State is the CSRF defence: an attacker cannot forge a callback because they
// cannot guess a `state` we issued and stored.

const (
	oauthStatePrefix = "auth:oauth:state:"
	oauthStateTTL    = 10 * time.Minute
	// providerTimeout bounds the token-exchange + profile HTTP calls so a slow
	// provider cannot tie up a request indefinitely.
	providerTimeout = 10 * time.Second
)

// oauthProfile is the normalised slice of a provider's user we actually use.
type oauthProfile struct {
	ProviderUserID string // stable, opaque id from the provider (never the email)
	Email          string
	EmailVerified  bool
	DisplayName    string
	Username       string // a hint for the generated handle (login / email local part)
}

// provider couples an OAuth2 client config with the function that reads a
// normalised profile from that specific provider's API.
type provider struct {
	config  *oauth2.Config
	profile func(ctx context.Context, c *oauth2.Config, tok *oauth2.Token) (oauthProfile, error)
}

// OAuthProviders carries the credentials needed to build the enabled providers.
// A provider with an empty id or secret is simply not registered.
type OAuthProviders struct {
	GithubClientID     string
	GithubClientSecret string
	GoogleClientID     string
	GoogleClientSecret string
	// RedirectBaseURL is this API's own public base URL; the per-provider
	// callback path is appended to it (and must match the OAuth app config).
	RedirectBaseURL string
}

// OAuthService runs the OAuth login flow on top of the auth Service (for
// issuing sessions and find-or-create) and the cache (for CSRF state).
type OAuthService struct {
	auth      *Service
	cache     cache.Cache
	providers map[string]*provider
}

// NewOAuthService builds the service, registering only the providers whose
// credentials are present. Call Enabled to check whether a given provider is on.
func NewOAuthService(authSvc *Service, c cache.Cache, p OAuthProviders) *OAuthService {
	providers := map[string]*provider{}

	if p.GithubClientID != "" && p.GithubClientSecret != "" {
		providers[models.ProviderGitHub] = &provider{
			config: &oauth2.Config{
				ClientID:     p.GithubClientID,
				ClientSecret: p.GithubClientSecret,
				Endpoint:     github.Endpoint,
				RedirectURL:  callbackURL(p.RedirectBaseURL, models.ProviderGitHub),
				Scopes:       []string{"read:user", "user:email"},
			},
			profile: fetchGitHubProfile,
		}
	}
	if p.GoogleClientID != "" && p.GoogleClientSecret != "" {
		providers[models.ProviderGoogle] = &provider{
			config: &oauth2.Config{
				ClientID:     p.GoogleClientID,
				ClientSecret: p.GoogleClientSecret,
				Endpoint:     google.Endpoint,
				RedirectURL:  callbackURL(p.RedirectBaseURL, models.ProviderGoogle),
				Scopes:       []string{"openid", "email", "profile"},
			},
			profile: fetchGoogleProfile,
		}
	}

	return &OAuthService{auth: authSvc, cache: c, providers: providers}
}

// Enabled reports whether the named provider is configured.
func (s *OAuthService) Enabled(name string) bool {
	_, ok := s.providers[name]
	return ok
}

// EnabledProviders lists the configured provider names (for the frontend to
// know which buttons to show).
func (s *OAuthService) EnabledProviders() []string {
	out := make([]string, 0, len(s.providers))
	// Stable order so the response is deterministic.
	for _, name := range []string{models.ProviderGitHub, models.ProviderGoogle} {
		if _, ok := s.providers[name]; ok {
			out = append(out, name)
		}
	}
	return out
}

// Start mints and stores a CSRF state, returning the provider consent URL to
// redirect the browser to.
func (s *OAuthService) Start(ctx context.Context, name string) (string, error) {
	p, ok := s.providers[name]
	if !ok {
		return "", httperr.NotFound("provider_unknown", "unknown or disabled login provider")
	}
	state, err := randToken(24)
	if err != nil {
		return "", httperr.Internal("could not start login").Wrap(err)
	}
	if err := s.cache.Set(ctx, oauthStatePrefix+state, []byte(name), oauthStateTTL); err != nil {
		return "", httperr.Internal("could not start login").Wrap(err)
	}
	return p.config.AuthCodeURL(state), nil
}

// Complete verifies state, exchanges the code, loads the profile, and turns it
// into a session (logging in, linking, or creating an account as appropriate).
func (s *OAuthService) Complete(ctx context.Context, name, state, code string) (*Session, error) {
	if state == "" || code == "" {
		return nil, httperr.BadRequest("invalid_oauth", "missing code or state")
	}
	stored, ok, err := s.cache.Get(ctx, oauthStatePrefix+state)
	if err != nil {
		return nil, httperr.Internal("could not verify login").Wrap(err)
	}
	if !ok || string(stored) != name {
		return nil, httperr.Unauthorized("invalid_oauth_state", "login session expired; please try again")
	}
	// Single-use: consume the state so a callback cannot be replayed.
	_ = s.cache.Delete(ctx, oauthStatePrefix+state)

	p, ok := s.providers[name]
	if !ok {
		return nil, httperr.NotFound("provider_unknown", "unknown or disabled login provider")
	}

	ctx, cancel := context.WithTimeout(ctx, providerTimeout)
	defer cancel()

	tok, err := p.config.Exchange(ctx, code)
	if err != nil {
		return nil, httperr.Unauthorized("oauth_exchange_failed", "could not complete login with the provider").Wrap(err)
	}
	prof, err := p.profile(ctx, p.config, tok)
	if err != nil {
		return nil, httperr.Internal("could not load provider profile").Wrap(err)
	}
	if prof.ProviderUserID == "" {
		return nil, httperr.Internal("provider returned no user id")
	}
	return s.auth.loginWithOAuth(ctx, name, prof)
}

// loginWithOAuth maps a provider profile onto a chains session:
//
//  1. an existing linked identity → log that user in;
//  2. otherwise, a verified email matching an existing account → link it;
//  3. otherwise → create a fresh, password-less account.
//
// A returning user (1) is logged in regardless of their current email, so it
// must be checked before we require one.
func (s *Service) loginWithOAuth(ctx context.Context, providerName string, prof oauthProfile) (*Session, error) {
	// 1. Already linked?
	id, err := s.users.FindIdentity(ctx, providerName, prof.ProviderUserID)
	if err == nil {
		user, err := s.users.FindByID(ctx, id.UserID)
		if err != nil {
			return nil, httperr.Internal("could not load user").Wrap(err)
		}
		return s.issue(ctx, user)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, httperr.Internal("could not look up identity").Wrap(err)
	}

	// A real, verified email is required to link or create: the users table
	// keeps email NOT NULL UNIQUE, and we never invent a placeholder.
	email := normaliseEmail(prof.Email)
	if email == "" || !prof.EmailVerified {
		return nil, httperr.BadRequest("oauth_no_email",
			"your account did not share a verified email; add one with the provider or sign up with email")
	}

	// 2. Verified email matches an existing account → link to it.
	existing, err := s.users.FindByEmail(ctx, email)
	if err == nil {
		link := &models.UserIdentity{
			ID:             uuid.New(),
			UserID:         existing.ID,
			Provider:       providerName,
			ProviderUserID: prof.ProviderUserID,
			Email:          email,
		}
		if err := s.users.CreateIdentity(ctx, link); err != nil {
			return nil, httperr.Internal("could not link account").Wrap(err)
		}
		return s.issue(ctx, existing)
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, httperr.Internal("could not look up user").Wrap(err)
	}

	// 3. Brand-new, password-less account.
	username, err := s.uniqueUsername(ctx, prof.Username, email)
	if err != nil {
		return nil, err
	}
	user := &models.User{
		ID:           uuid.New(),
		Email:        email,
		Username:     username,
		PasswordHash: "", // OAuth-only: never matches a bcrypt comparison
		DisplayName:  firstNonEmpty(strings.TrimSpace(prof.DisplayName), username),
	}
	identity := &models.UserIdentity{
		ID:             uuid.New(),
		Provider:       providerName,
		ProviderUserID: prof.ProviderUserID,
		Email:          email,
	}
	if err := s.users.CreateUserWithIdentity(ctx, user, identity); err != nil {
		if errors.Is(err, gorm.ErrDuplicatedKey) {
			// Race between the checks above and insert.
			return nil, httperr.Conflict("account_exists", "an account using this email or name already exists")
		}
		return nil, httperr.Internal("could not create account").Wrap(err)
	}
	return s.issue(ctx, user)
}

// usernameStrip removes anything outside the allowed handle alphabet.
var usernameStrip = regexp.MustCompile(`[^a-z0-9_]`)

// uniqueUsername derives a valid, unique handle from a hint (provider login or
// email local part), appending a short random suffix on collision.
func (s *Service) uniqueUsername(ctx context.Context, hint, email string) (string, error) {
	base := sanitiseUsername(hint)
	if len(base) < 3 {
		if at := strings.IndexByte(email, '@'); at > 0 {
			base = sanitiseUsername(email[:at])
		}
	}
	if len(base) < 3 {
		base = "user"
	}
	if len(base) > 24 {
		base = base[:24]
	}

	candidate := base
	for attempt := 0; attempt < 6; attempt++ {
		taken, err := s.users.ExistsByUsername(ctx, candidate)
		if err != nil {
			return "", httperr.Internal("could not check username").Wrap(err)
		}
		if !taken {
			return candidate, nil
		}
		suffix, err := randHex(3)
		if err != nil {
			return "", httperr.Internal("could not generate username").Wrap(err)
		}
		candidate = base + "_" + suffix
		if len(candidate) > 30 {
			candidate = candidate[:30]
		}
	}
	return "", httperr.Internal("could not allocate a unique username")
}

func sanitiseUsername(s string) string {
	return usernameStrip.ReplaceAllString(strings.ToLower(strings.TrimSpace(s)), "")
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func randToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func randHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func callbackURL(base, providerName string) string {
	return strings.TrimRight(base, "/") + "/api/auth/oauth/" + providerName + "/callback"
}

// fetchGitHubProfile reads the authenticated user and their verified primary
// email (GitHub omits the email from /user unless it is set public).
func fetchGitHubProfile(ctx context.Context, c *oauth2.Config, tok *oauth2.Token) (oauthProfile, error) {
	client := c.Client(ctx, tok)

	var u struct {
		ID    int64  `json:"id"`
		Login string `json:"login"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := getJSON(ctx, client, "https://api.github.com/user", &u); err != nil {
		return oauthProfile{}, err
	}
	prof := oauthProfile{
		ProviderUserID: fmt.Sprintf("%d", u.ID),
		DisplayName:    u.Name,
		Username:       u.Login,
	}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := getJSON(ctx, client, "https://api.github.com/user/emails", &emails); err == nil {
		if e := pickEmail(emails); e != "" {
			prof.Email = e
			prof.EmailVerified = true
		}
	}
	// Fall back to the public email on /user, which GitHub only exposes once
	// confirmed, so it is safe to treat as verified.
	if prof.Email == "" && u.Email != "" {
		prof.Email = u.Email
		prof.EmailVerified = true
	}
	return prof, nil
}

// pickEmail chooses the primary verified address, else any verified one.
func pickEmail(emails []struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}) string {
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email
		}
	}
	for _, e := range emails {
		if e.Verified {
			return e.Email
		}
	}
	return ""
}

// fetchGoogleProfile reads the OpenID Connect userinfo for the signed-in user.
func fetchGoogleProfile(ctx context.Context, c *oauth2.Config, tok *oauth2.Token) (oauthProfile, error) {
	client := c.Client(ctx, tok)

	var u struct {
		Sub           string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := getJSON(ctx, client, "https://openidconnect.googleapis.com/v1/userinfo", &u); err != nil {
		return oauthProfile{}, err
	}
	username := ""
	if at := strings.IndexByte(u.Email, '@'); at > 0 {
		username = u.Email[:at]
	}
	return oauthProfile{
		ProviderUserID: u.Sub,
		Email:          u.Email,
		EmailVerified:  u.EmailVerified,
		DisplayName:    u.Name,
		Username:       username,
	}, nil
}

// getJSON performs an authenticated GET and decodes a JSON response, capping the
// error body so a misbehaving provider cannot flood the logs.
func getJSON(ctx context.Context, client *http.Client, url string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("provider GET %s returned %d: %s", url, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(out)
}
