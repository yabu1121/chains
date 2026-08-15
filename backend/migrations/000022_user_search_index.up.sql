-- User search runs ILIKE '%term%' (leading wildcard) across name + the "about"
-- fields, which a btree index can't serve — so it was a full table scan per
-- search. Add a pg_trgm GIN index on the same concatenated expression the query
-- now uses, turning search into an index lookup.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_users_search_trgm ON users USING gin (
    (username || ' ' || display_name || ' ' || interests || ' ' || looking_for || ' ' || can_help_with || ' ' || building_now) gin_trgm_ops
);
