-- Communities: a named group (a tech event, hackathon, school, lab, …) that
-- people join, giving each gathering its own "roster with a relationship map".
-- Membership is open: anyone can create a community and anyone can join one.
CREATE TABLE communities (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    created_by  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_members (
    id           uuid PRIMARY KEY,
    community_id uuid NOT NULL REFERENCES communities (id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_community_member UNIQUE (community_id, user_id)
);
CREATE INDEX idx_community_members_user ON community_members (user_id);
CREATE INDEX idx_community_members_community ON community_members (community_id);
