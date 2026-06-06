-- External OAuth identities (GitHub, Google). One row per linked provider
-- account; a single chains user may have several. (provider, provider_user_id)
-- is the stable key we match a returning OAuth login against. password_hash on
-- users stays NOT NULL but OAuth-only accounts store '' (empty), which can
-- never match a bcrypt comparison, so they simply cannot password-login.
CREATE TABLE user_identities (
    id               uuid        PRIMARY KEY,
    user_id          uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider         text        NOT NULL,
    provider_user_id text        NOT NULL,
    email            text        NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_user_identities_user_id ON user_identities (user_id);
