-- Track star rating (2026-09-06): the second taste signal — the user rates
-- a whole creation 1–5 from the track's "…" menu. Read by the taste note
-- (src/lib/jam/taste.ts) alongside the turn votes in jam_votes.
--
-- Apply:  supabase db query --linked -f apps/jam/schema/006_jam_track_rating.sql

alter table jam_tracks add column if not exists rating smallint check (rating between 1 and 5);
