-- Minimal safety operations: an admin flag and a review status on reports, so a
-- moderator has a queue to triage (open → reviewed → actioned / dismissed). Admins
-- are granted out of band (UPDATE users SET is_admin = true WHERE …).
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;

ALTER TABLE reports
    ADD COLUMN status text NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'reviewed', 'actioned', 'dismissed'));
CREATE INDEX idx_reports_status ON reports (status, created_at);
