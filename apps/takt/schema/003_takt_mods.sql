-- Takt mods (2026-11-01): Agent mode's own versions of the Stage songs, one row per mod, the
-- whole bundle the app downloads (the song file in the app's own format, this song's charting
-- override, the conversation). See src/lib/takt/mods.ts and apps/takt/CLAUDE.md "Agent mode".
-- Apply: supabase db query --linked -f apps/takt/schema/003_takt_mods.sql

create table if not exists takt_mods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references takt_users(id) on delete cascade,
  -- The song it was cloned from (a bundled song's name, or another mod's).
  base text not null,
  base_title text not null,
  -- "mod-1a2b3c4d": the Song.name in the app and the board's key.
  name text not null unique,
  title text not null,
  -- Turns that changed the song; 0 until the agent changes something.
  version int not null default 0,
  song jsonb not null,
  -- The shape of charting.json's songs.<name>: per part, a tier per difficulty, a phrase, tier patches.
  charting jsonb,
  -- [{ role: user|agent, text, at, steps? }]
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists takt_mods_user on takt_mods (user_id, created_at);

-- Only the server (service key) reads or writes these.
alter table takt_mods enable row level security;
