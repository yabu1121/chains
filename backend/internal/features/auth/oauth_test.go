package auth

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/cymed/chains/backend/internal/models"
)

// newOAuthUser is a verified GitHub-style profile for a brand-new account.
func githubProfile(email string, verified bool) oauthProfile {
	return oauthProfile{
		ProviderUserID: "gh-12345",
		Email:          email,
		EmailVerified:  verified,
		DisplayName:    "Octo Cat",
		Username:       "octocat",
	}
}

func TestLoginWithOAuth_CreatesNewAccount(t *testing.T) {
	store := newFakeUserStore()
	svc := newTestService(store)

	sess, err := svc.loginWithOAuth(context.Background(), models.ProviderGitHub, githubProfile("octo@example.com", true))
	require.NoError(t, err)
	require.NotEmpty(t, sess.AccessToken)
	require.Equal(t, "octo@example.com", sess.User.Email)
	require.Equal(t, "octocat", sess.User.Username)

	// A password-less user was persisted and linked to the identity.
	u, err := store.FindByEmail(context.Background(), "octo@example.com")
	require.NoError(t, err)
	require.Empty(t, u.PasswordHash, "OAuth-only account must have no password")

	id, err := store.FindIdentity(context.Background(), models.ProviderGitHub, "gh-12345")
	require.NoError(t, err)
	require.Equal(t, u.ID, id.UserID)
}

func TestLoginWithOAuth_ReturningUserReusesAccount(t *testing.T) {
	store := newFakeUserStore()
	svc := newTestService(store)
	ctx := context.Background()

	first, err := svc.loginWithOAuth(ctx, models.ProviderGitHub, githubProfile("octo@example.com", true))
	require.NoError(t, err)

	second, err := svc.loginWithOAuth(ctx, models.ProviderGitHub, githubProfile("octo@example.com", true))
	require.NoError(t, err)

	require.Equal(t, first.User.ID, second.User.ID, "same provider id must map to the same user")
	require.Len(t, store.byID, 1, "no duplicate user created on second login")
}

func TestLoginWithOAuth_LinksToExistingEmailAccount(t *testing.T) {
	store := newFakeUserStore()
	svc := newTestService(store)
	ctx := context.Background()

	// A password account already exists for this email.
	existing, err := svc.Register(ctx, RegisterRequest{
		Email: "octo@example.com", Username: "existing_user", Password: "supersecret", DisplayName: "Existing",
	})
	require.NoError(t, err)

	sess, err := svc.loginWithOAuth(ctx, models.ProviderGitHub, githubProfile("octo@example.com", true))
	require.NoError(t, err)

	require.Equal(t, existing.User.ID, sess.User.ID, "verified email should link to the existing account")
	require.Len(t, store.byID, 1, "linking must not create a second user")

	id, err := store.FindIdentity(ctx, models.ProviderGitHub, "gh-12345")
	require.NoError(t, err)
	require.Equal(t, existing.User.ID, id.UserID)
}

func TestLoginWithOAuth_RejectsMissingOrUnverifiedEmail(t *testing.T) {
	ctx := context.Background()

	t.Run("no email", func(t *testing.T) {
		svc := newTestService(newFakeUserStore())
		_, err := svc.loginWithOAuth(ctx, models.ProviderGitHub, githubProfile("", false))
		assertHTTPStatus(t, err, 400, "oauth_no_email")
	})

	t.Run("unverified email", func(t *testing.T) {
		svc := newTestService(newFakeUserStore())
		_, err := svc.loginWithOAuth(ctx, models.ProviderGoogle, githubProfile("octo@example.com", false))
		assertHTTPStatus(t, err, 400, "oauth_no_email")
	})
}

func TestUniqueUsername_AppendsSuffixOnCollision(t *testing.T) {
	store := newFakeUserStore()
	svc := newTestService(store)
	ctx := context.Background()

	// Seed a user that already owns the obvious handle.
	store.byUsername["octocat"] = &models.User{ID: uuid.New(), Username: "octocat"}

	name, err := svc.uniqueUsername(ctx, "octocat", "octo@example.com")
	require.NoError(t, err)
	require.NotEqual(t, "octocat", name)
	require.True(t, usernamePattern.MatchString(name), "generated username %q must be valid", name)
}
