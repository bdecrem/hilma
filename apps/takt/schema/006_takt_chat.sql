-- Takt chat (2026-11-06): every question to the teacher from the app's Ask button, one row
-- each: where the player was (the context the app sent, and its one-line summary), the
-- question, the answer. See src/lib/takt/chat-agent.ts.
-- Apply: supabase db query --linked -f apps/takt/schema/006_takt_chat.sql

create table if not exists takt_chat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references takt_users(id) on delete cascade,
  -- "Blue Lantern II · White keys · Medium · Level 1 · bar 13"
  where_line text not null default '',
  -- { screen, device, where, level, song, lesson, progress }
  context jsonb not null default '{}'::jsonb,
  question text not null,
  answer text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists takt_chat_user on takt_chat (user_id, created_at);

-- Only the server (service key) reads or writes these.
alter table takt_chat enable row level security;
