DROP INDEX IF EXISTS uq_users_username;
ALTER TABLE users DROP COLUMN IF EXISTS username;
