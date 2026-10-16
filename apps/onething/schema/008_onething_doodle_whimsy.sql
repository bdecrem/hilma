-- Onething: whimsical doodles on hard days (2026-10-16).
--
-- Some sentences give the doodler nothing it can draw clearly (a feeling, a
-- list, admin), and the strained literal drawing that comes back is hard to
-- read. On those days the model may draw something whimsical instead (a
-- smiley face, a waving stick figure, a sun in sunglasses). doodle_whimsy
-- marks a day it did, so the next day has to find a real image: at most every
-- other doodle is whimsical (whimsyAllowed in doodle.ts).
--
-- Apply with: supabase db query --linked -f apps/onething/schema/008_onething_doodle_whimsy.sql

alter table onething_entries add column if not exists doodle_whimsy boolean not null default false;
