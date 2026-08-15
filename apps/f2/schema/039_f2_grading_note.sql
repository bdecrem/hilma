-- Per-card note to the grading agent ("don't be too literal") — set from
-- the post-quiz card clinic, honored by every judge that grades the card.
alter table f2_flash_cards
  add column if not exists grading_note text;
