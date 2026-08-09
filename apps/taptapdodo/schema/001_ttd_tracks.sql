-- Tap Tap Dodo online track store. One row per downloadable track pack;
-- payload is the full track-pack JSON (format v1, see TrackPack.swift).
-- Public read-only via /api/ttd/tracks; writes happen through the seed
-- script (scripts/ttd-seed-track.mjs) with the service key.

create table if not exists ttd_tracks (
  id text primary key,
  name text,
  payload jsonb not null,
  created_at timestamptz default now()
);
