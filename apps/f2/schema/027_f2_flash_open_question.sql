-- F2: standalone rewording for choice-dependent flash questions.
--
-- Decks are played in three modes, but some questions only make sense with
-- the choices visible ("Which of these belongs to…"). open_question holds an
-- equivalent standalone rewording (same canonical answer) used by text and
-- voice modes; null means the base question already stands alone (the common
-- case). Populated at generation time; scripts/backfill-open-questions.mjs
-- fixed the pre-existing decks.

alter table f2_flash_cards
  add column if not exists open_question text;
