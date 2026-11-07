-- Takt mods: the kind of a row (2026-11-07). 'mod' is Agent mode's own version of a track;
-- 'solo' is the improv teacher's whole track written from the player's take (src/lib/takt/
-- solo-agent.ts): the same bundle, but the app shows it as the Solo level on the song it came
-- from instead of as a card of its own. One solo per song and player; a new take rewrites it as
-- the next version, so the history keeps every earlier solo.
-- Apply: supabase db query --linked -f apps/takt/schema/007_takt_mods_kind.sql

alter table takt_mods add column if not exists kind text not null default 'mod';

create index if not exists takt_mods_user_kind on takt_mods (user_id, kind, base);
