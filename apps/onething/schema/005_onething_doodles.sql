-- Onething: a doodle for every entry (2026-09-23).
--
-- When a sentence is kept, Opus 5.5 (low effort) draws a small margin doodle
-- for that day: stroke-only SVG in the journal's ink with one red accent,
-- almost always wordless. The SVG inner markup is stored on the day's row
-- (regenerated when the day's text changes); doodle_word is the word or two
-- the doodle carries, when it carries any, so the next days can be kept
-- wordless (one worded doodle every four days at most — see doodle.ts).
--
-- Apply with: supabase db query --linked -f apps/onething/schema/005_onething_doodles.sql

alter table onething_entries add column if not exists doodle text;
alter table onething_entries add column if not exists doodle_word text;
alter table onething_entries add column if not exists doodle_alt text;
alter table onething_entries add column if not exists doodled_at timestamptz;
