-- Jam turn votes (2026-09-06): after each agent turn the user can rate it
-- (thumbs up/down, 1–3 strong). Votes feed a per-user "taste note" that the
-- LLM route appends to the agent's system prompt (src/lib/jam/taste.ts).
-- v2 will add implicit signals (edits, publish) through `source`.
--
-- Apply:  supabase db query --linked -f apps/jam/schema/005_jam_votes.sql
-- Verify: ./scripts/db "select count(*) from jam_votes"

create table if not exists jam_votes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references jam_users(id) on delete cascade,
  track_id   uuid not null references jam_tracks(id) on delete cascade,
  -- the feed id of the user message that started the turn
  turn_id    text not null,
  -- +1..+3 thumbs up, -1..-3 thumbs down (0 = removed → row deleted)
  score      smallint not null check (score between -3 and 3 and score <> 0),
  source     text not null default 'vote',
  prompt     text,
  reply      text,
  actions    jsonb not null default '[]'::jsonb,
  state      jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id, turn_id)
);

create index if not exists jam_votes_user_created on jam_votes (user_id, created_at desc);

alter table jam_votes enable row level security;

alter table jam_users
  add column if not exists taste_note text,
  add column if not exists taste_votes_seen integer not null default 0,
  add column if not exists taste_updated_at timestamptz;
