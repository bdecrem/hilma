-- Jam (hilma /jam): accounts + saved tracks.
--
-- Apply:  supabase db query --linked -f apps/jam/schema/001_jam.sql
-- Verify: ./scripts/db "select column_name, data_type from information_schema.columns where table_name='jam_tracks' order by ordinal_position"
--
-- Sessions are HMAC cookies (src/lib/jam/auth.ts), no session table.
-- Both tables are service-role only (RLS on, no policies): the Next.js
-- routes are the only client.

create extension if not exists pgcrypto;

create table if not exists jam_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists jam_tracks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references jam_users(id) on delete cascade,
  title      text not null default 'Untitled',
  bpm        integer not null default 128,
  bars       integer not null default 2,
  -- serializeSession() output (patterns, params, effects, arrangement)
  session    jsonb,
  -- Anthropic-format chat history the agent loop resumes from
  messages   jsonb not null default '[]'::jsonb,
  -- what the user saw (text, tool chips, notes); last ~200 items
  feed       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jam_tracks_user_updated
  on jam_tracks (user_id, updated_at desc);

alter table jam_users  enable row level security;
alter table jam_tracks enable row level security;
