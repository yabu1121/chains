-- Public handle used for discovery and display. Lowercased & validated by the
-- application; unique case-sensitively here because the app stores it lowercase.
ALTER TABLE users ADD COLUMN username text NOT NULL;
CREATE UNIQUE INDEX uq_users_username ON users (username);
