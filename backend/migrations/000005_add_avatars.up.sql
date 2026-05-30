-- Profile avatars. Image bytes live in their own table (one row per user) to
-- keep the frequently-queried users row lean; users.avatar_updated_at is a
-- nullable flag/version so list and graph queries can tell whether an avatar
-- exists (and cache-bust it) without joining the blob table.
ALTER TABLE users
    ADD COLUMN avatar_updated_at timestamptz;

CREATE TABLE user_avatars (
    user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data         bytea       NOT NULL,
    content_type text        NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);
