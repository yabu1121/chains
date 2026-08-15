-- Notes: a private memo one user keeps about another (typically someone they
-- added by QR). Only the owner can ever read or write their own notes. Stores
-- the structured "where did we meet / what did we talk about / follow up?" plus
-- a free-form memo, so chains doubles as a business-card organiser.
CREATE TABLE notes (
    id             uuid PRIMARY KEY,
    owner_id       uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    target_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    where_met      text NOT NULL DEFAULT '',
    what_discussed text NOT NULL DEFAULT '',
    follow_up      boolean NOT NULL DEFAULT false,
    memo           text NOT NULL DEFAULT '',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notes_no_self CHECK (owner_id <> target_id),
    CONSTRAINT uq_note_owner_target UNIQUE (owner_id, target_id)
);
CREATE INDEX idx_notes_owner ON notes (owner_id);
