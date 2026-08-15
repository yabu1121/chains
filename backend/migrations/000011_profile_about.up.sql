-- Add structured "about" fields so a profile conveys not just *what* someone
-- codes but *who they want to connect with*: their interests, what they are
-- looking for, what they can help others with, and what they are building now.
-- All are free text, default empty, and (like job_title / status_message) always
-- visible — their whole purpose is to give people a reason to reach out.
ALTER TABLE users
    ADD COLUMN interests     text NOT NULL DEFAULT '',
    ADD COLUMN looking_for   text NOT NULL DEFAULT '',
    ADD COLUMN can_help_with text NOT NULL DEFAULT '',
    ADD COLUMN building_now  text NOT NULL DEFAULT '';
