-- Onething: the doodle's register (2026-10-19).
--
-- Before drawing, the model reads the day's weight and picks light, neutral
-- or heavy (doodle.ts). A heavy day's doodle sits still on the page: no boil.
-- Null for doodles drawn before this column, which boil as before.
--
-- Apply with: supabase db query --linked -f apps/onething/schema/009_onething_doodle_register.sql

alter table onething_entries add column if not exists doodle_register text check (doodle_register in ('light', 'neutral', 'heavy'));
