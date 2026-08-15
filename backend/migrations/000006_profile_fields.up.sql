-- Replace the free-text bio with a structured job title + status message, and
-- add an optional birth date with independent visibility toggles for the age
-- and the date itself (age is shown by default; the exact date is hidden).
ALTER TABLE users
    DROP COLUMN bio,
    ADD COLUMN job_title       text    NOT NULL DEFAULT '',
    ADD COLUMN status_message  text    NOT NULL DEFAULT '',
    ADD COLUMN birth_date      date,
    ADD COLUMN show_age        boolean NOT NULL DEFAULT true,
    ADD COLUMN show_birth_date boolean NOT NULL DEFAULT false;
