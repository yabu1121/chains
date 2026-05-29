-- Programming languages a user has experience with. Normalised so we can later
-- search "who knows Go". One row per (user, language); order preserved via
-- position. Uniqueness is case-insensitive per user.
CREATE TABLE user_languages (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    language   text NOT NULL,
    position   int  NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_user_language ON user_languages (user_id, lower(language));
CREATE INDEX idx_user_languages_lang ON user_languages (lower(language));
