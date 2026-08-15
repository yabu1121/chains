ALTER TABLE notes ADD COLUMN follow_up boolean NOT NULL DEFAULT false;
UPDATE notes SET follow_up = true WHERE follow_up_status IN ('pending', 'snoozed');
ALTER TABLE notes
    DROP COLUMN follow_up_status,
    DROP COLUMN due_on,
    DROP COLUMN next_action,
    DROP COLUMN topic_tags,
    DROP COLUMN met_on;
