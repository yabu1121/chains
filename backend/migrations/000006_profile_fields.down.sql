ALTER TABLE users
    DROP COLUMN show_birth_date,
    DROP COLUMN show_age,
    DROP COLUMN birth_date,
    DROP COLUMN status_message,
    DROP COLUMN job_title,
    ADD COLUMN bio text NOT NULL DEFAULT '';
