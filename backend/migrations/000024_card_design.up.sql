-- Connection Cards become HTML "card works": each card carries a visual template,
-- a colour theme, and a layout descriptor (which blocks to show, accent, titles)
-- so the same card renders identically in the composer, inbox, sent list and
-- per-person history. Existing rows take the neutral defaults.
ALTER TABLE cards
    ADD COLUMN template text NOT NULL DEFAULT 'classic',
    ADD COLUMN theme    text NOT NULL DEFAULT 'paper',
    ADD COLUMN layout   text NOT NULL DEFAULT '{}';
