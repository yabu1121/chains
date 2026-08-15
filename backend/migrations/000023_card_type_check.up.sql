-- The card type set is enforced only in application code; add a DB CHECK so an
-- unexpected type can never reach the database (matching saved_articles.status,
-- notes.follow_up_status, reports.status which all have CHECKs).
ALTER TABLE cards
    ADD CONSTRAINT cards_type_check CHECK (type IN (
        'thanks', 'talk_again', 'article', 'intro', 'consult',
        'hackathon', 'status', 'ui_review', 'beacon_reply'
    ));
