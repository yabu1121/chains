-- Saved articles: a user's personal reading list built from the News feed. This
-- is the spine of retention — "save / read later / mark read / hide" — and the
-- store of interest signal that sharpens future recommendations. One row per
-- (user, url). status: unread (saved, to read), read (done), hidden (dismissed
-- from the feed, never resurfaced).
CREATE TABLE saved_articles (
    id           uuid PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    url          text NOT NULL,
    title        text NOT NULL,
    source       text NOT NULL DEFAULT '',
    author       text NOT NULL DEFAULT '',
    summary      text NOT NULL DEFAULT '',
    language     text NOT NULL DEFAULT '',
    published_at timestamptz,
    status       text NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'hidden')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_saved_user_url UNIQUE (user_id, url)
);
CREATE INDEX idx_saved_user_status ON saved_articles (user_id, status);
