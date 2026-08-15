-- Reports: a user flagging another for review (spam, harassment, impersonation,
-- …). A safety basic needed before launch; reviewed out of band.
CREATE TABLE reports (
    id          uuid PRIMARY KEY,
    reporter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reported_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    reason      text NOT NULL,
    details     text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reports_no_self CHECK (reporter_id <> reported_id)
);
CREATE INDEX idx_reports_reported ON reports (reported_id);
