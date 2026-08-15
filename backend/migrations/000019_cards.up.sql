-- Connection Cards: private, image-card-style messages sent between friends to
-- move a relationship forward — thanks, "let's talk again", an article share, a
-- consult request, a beacon reply, etc. Unlike a chat message, a card is a
-- discrete, typed gesture with structured context (topic, tags, article, next
-- action). Only the two people involved ever see it.
CREATE TABLE cards (
    id            uuid PRIMARY KEY,
    sender_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    recipient_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type          text NOT NULL,
    topic         text NOT NULL DEFAULT '',
    tags          text NOT NULL DEFAULT '[]',
    article_url   text NOT NULL DEFAULT '',
    article_title text NOT NULL DEFAULT '',
    next_action   text NOT NULL DEFAULT '',
    message       text NOT NULL DEFAULT '',
    read_at       timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cards_no_self CHECK (sender_id <> recipient_id)
);
CREATE INDEX idx_cards_recipient ON cards (recipient_id, created_at DESC);
CREATE INDEX idx_cards_sender ON cards (sender_id, created_at DESC);
