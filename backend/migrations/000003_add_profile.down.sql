ALTER TABLE users
    DROP COLUMN IF EXISTS bio,
    DROP COLUMN IF EXISTS x_handle,
    DROP COLUMN IF EXISTS github_handle,
    DROP COLUMN IF EXISTS zenn_handle,
    DROP COLUMN IF EXISTS linkedin_url,
    DROP COLUMN IF EXISTS portfolio_url;
