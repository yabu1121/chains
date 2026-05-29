-- Profile fields. Handles are stored bare (no leading @, no URL); the app
-- composes the full URL when rendering. LinkedIn and portfolio are full URLs.
ALTER TABLE users
    ADD COLUMN bio           text NOT NULL DEFAULT '',
    ADD COLUMN x_handle      text NOT NULL DEFAULT '',
    ADD COLUMN github_handle text NOT NULL DEFAULT '',
    ADD COLUMN zenn_handle   text NOT NULL DEFAULT '',
    ADD COLUMN linkedin_url  text NOT NULL DEFAULT '',
    ADD COLUMN portfolio_url text NOT NULL DEFAULT '';
