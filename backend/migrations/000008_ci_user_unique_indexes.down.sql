-- Revert to plain case-sensitive unique indexes on the bare columns.
DROP INDEX IF EXISTS uq_users_email;
CREATE UNIQUE INDEX uq_users_email ON users (email);

DROP INDEX IF EXISTS uq_users_username;
CREATE UNIQUE INDEX uq_users_username ON users (username);
