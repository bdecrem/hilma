-- Rollback + starred tracks (2026-09-07).
--
-- jam_snapshots: the track's state (session, agent history, feed) right
-- after each agent turn — the five most recent per track — so the Studio can
-- roll back to an earlier point ("↺" in the row under a turn).
-- jam_tracks.starred_at: the user's favourites (a card with an orange edge,
-- sorted first); starring is also a whole-track taste signal.
--
-- Apply:  supabase db query --linked -f apps/jam/schema/008_jam_snapshots_star.sql

create table if not exists jam_snapshots (
  id         uuid primary key default gen_random_uuid(),
  track_id   uuid not null references jam_tracks(id) on delete cascade,
  user_id    uuid not null references jam_users(id) on delete cascade,
  -- feed id of the user message that started the turn
  turn_id    text not null,
  session    jsonb,
  messages   jsonb not null default '[]'::jsonb,
  feed       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (track_id, turn_id)
);

create index if not exists jam_snapshots_track_created on jam_snapshots (track_id, created_at desc);

alter table jam_snapshots enable row level security;

alter table jam_tracks add column if not exists starred_at timestamptz;
