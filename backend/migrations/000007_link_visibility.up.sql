-- Per-link visibility: each account link can be shown to everyone, to accepted
-- friends only, or kept private. Defaults to 'friends' to preserve the prior
-- friends-only link behaviour.
ALTER TABLE users
    ADD COLUMN x_handle_visibility      text NOT NULL DEFAULT 'friends',
    ADD COLUMN github_handle_visibility text NOT NULL DEFAULT 'friends',
    ADD COLUMN zenn_handle_visibility   text NOT NULL DEFAULT 'friends',
    ADD COLUMN linkedin_url_visibility  text NOT NULL DEFAULT 'friends',
    ADD COLUMN portfolio_url_visibility text NOT NULL DEFAULT 'friends';
