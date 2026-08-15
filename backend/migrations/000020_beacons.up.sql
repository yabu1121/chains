-- Beacons: a short, ephemeral "you can talk to me about this right now" signal —
-- not a post. One active beacon per user; it expires (≈72h) so the network shows
-- only live signals. Friends reply with a Connection Card, not a comment.
CREATE TABLE beacons (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
    message    text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX idx_beacons_expires ON beacons (expires_at);
