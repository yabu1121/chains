-- Analytics events: a minimal first-party event log so the launch KPIs
-- (onboarding completion, first QR exchange, first note, follow-up set/complete,
-- saves, retention) are computable from our own data. No third-party tracker.
CREATE TABLE analytics_events (
    id         uuid PRIMARY KEY,
    user_id    uuid REFERENCES users (id) ON DELETE SET NULL,
    name       text NOT NULL,
    props      text NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_analytics_events_name_created ON analytics_events (name, created_at);
CREATE INDEX idx_analytics_events_user_created ON analytics_events (user_id, created_at);
