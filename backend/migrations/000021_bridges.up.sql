-- Bridges: an introduction one user makes between two of their friends ("you two
-- should meet"). It sends an intro Connection Card to each and records the bridge
-- so the introduced relationship is remembered (and can be drawn on the network).
CREATE TABLE bridges (
    id            uuid PRIMARY KEY,
    introducer_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_a_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    user_b_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason        text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT bridges_distinct CHECK (
        user_a_id <> user_b_id AND introducer_id <> user_a_id AND introducer_id <> user_b_id
    )
);
CREATE INDEX idx_bridges_user_a ON bridges (user_a_id);
CREATE INDEX idx_bridges_user_b ON bridges (user_b_id);
