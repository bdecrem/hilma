-- Difficulty (2026-11-27, OLA-485). Bart: "Does our issue tracker have a difficulty feature? If not,
-- add it now." Optional; null = not rated. easy = one place, a few lines; medium = a few files or some
-- logic to understand; hard = several parts that must fit together, or unclear where the cause is.
-- Additive only. Apply: supabase db query --linked -f <this file>.
alter table venture_issues add column if not exists difficulty text check (difficulty in ('easy', 'medium', 'hard'));
