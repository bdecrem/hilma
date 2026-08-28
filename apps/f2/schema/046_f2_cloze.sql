-- Fill-in-the-word form for cards whose fact pivots on one crisp term/name/
-- number. Authored by the card generator only when the card is a genuinely
-- good candidate (~25-30% of cards). cloze_text is a complete sentence with
-- the term as ___; cloze_answer is the exact missing word(s). A non-null
-- cloze_answer IS the flag. Mixed-mode sets present these cards as cloze
-- instead of choice/text. Applied 2026-08-28.
alter table f2_flash_cards
  add column if not exists cloze_text text,
  add column if not exists cloze_answer text;
