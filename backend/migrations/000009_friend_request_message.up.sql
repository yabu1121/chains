-- A friend request can carry an optional short message from the requester.
-- NOT NULL DEFAULT '' keeps existing rows valid and lets the app treat "no
-- message" as an empty string rather than NULL.
ALTER TABLE friendships ADD COLUMN message text NOT NULL DEFAULT '';
