-- Make the email and username uniqueness constraints case-insensitive at the
-- database level. The application already lowercases both before insert, so
-- this is defence-in-depth: even a code path that forgets to normalise cannot
-- create "Alice@x.com" alongside "alice@x.com". Mirrors the lower() functional
-- indexes already used for user_languages.
--
-- Because existing rows are already stored lowercase, lower(col) = col, so no
-- collisions can arise from this change.
DROP INDEX IF EXISTS uq_users_email;
CREATE UNIQUE INDEX uq_users_email ON users (lower(email));

DROP INDEX IF EXISTS uq_users_username;
CREATE UNIQUE INDEX uq_users_username ON users (lower(username));
