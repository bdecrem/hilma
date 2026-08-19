-- F2 flash: third card rating value.
--
--   'down'     = double thumbs down — bury it, never serve it again
--   'down1'    = single thumbs down — "exotica": stays in rotation, but any
--                given set (topic or Peck) serves at most ONE such card
--   'priority' = double thumbs up — resurface aggressively until mastered
--
-- The partial indexes from 024 keep working: down1 is distinct from 'down',
-- so down1 cards stay inside f2_flash_cards_due_idx (servable) as intended.
alter table f2_flash_cards drop constraint if exists f2_flash_cards_rating_check;
alter table f2_flash_cards add constraint f2_flash_cards_rating_check
  check (rating is null or rating in ('down', 'down1', 'priority'));
