-- Turn the friend note into a proper interaction log: when/where you met, topic
-- tags, the next action and its due date, and a follow-up *status* (a workflow,
-- not a boolean). The old follow_up flag becomes follow_up_status='pending' so
-- nothing is lost. This is what makes "QR交換 → メモ → フォローアップ → 週次で戻る"
-- an actual processable loop instead of a list that just fills up.
ALTER TABLE notes
    ADD COLUMN met_on           date,
    ADD COLUMN topic_tags       text NOT NULL DEFAULT '[]',
    ADD COLUMN next_action      text NOT NULL DEFAULT '',
    ADD COLUMN due_on           date,
    ADD COLUMN follow_up_status text NOT NULL DEFAULT 'none'
        CHECK (follow_up_status IN ('none', 'pending', 'contacted', 'snoozed', 'dismissed'));

UPDATE notes SET follow_up_status = 'pending' WHERE follow_up = true;

ALTER TABLE notes DROP COLUMN follow_up;
