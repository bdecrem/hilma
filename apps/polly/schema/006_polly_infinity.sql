-- Polly: Infinity Chat (2026-09-19).
--
-- An endless, low-pressure conversation. You just talk — messy, half-English,
-- whatever — then "clean it up": Polly curates the FIVE most worth-fixing
-- moments and walks you through them one at a time (voice + before/after
-- cards), and those five become Vocab (flash, either direction) and Grammar
-- (a one-line explanation + a drill each). New chat anytime. It's a consumer
-- app, not a learning dashboard.
--
-- One Infinity Chat is ONE topic (a polly_threads row, kind 'infinity', title
-- always "Infinity Chat"); each conversation in it is a row in the new
-- polly_infinity_chats table, carrying its transcript's voice session and a
-- jsonb `analysis` (the ≤5 fixes + vocab + grammar). The clean-up itself is a
-- voice session of the new mode 'cleanup'.
--
-- Apply:  supabase db query --linked -f apps/polly/schema/006_polly_infinity.sql
--   (or paste into the Supabase SQL editor, project tqniseocczttrfwtpbdr)
-- See src/lib/polly/infinity.ts and the /api/polly/infinity/* routes.

-- 1. The new topic kind.
alter table polly_threads drop constraint if exists polly_threads_kind_check;
alter table polly_threads add constraint polly_threads_kind_check check (
  kind in (
    'chat','web','audio','video','paste','fallback','book','mini','general',
    'guest_lesson','immersion','ask','lesson','infinity'
  )
);

-- 2. The new voice mode for the clean-up walk.
alter table polly_voice_sessions drop constraint if exists polly_voice_sessions_mode_check;
alter table polly_voice_sessions add constraint polly_voice_sessions_mode_check check (
  mode in (
    'global','topic','flash','final_review','second_chance','recert','placement','cleanup'
  )
);

-- 3. The conversations. One row per free chat inside an Infinity Chat topic.
create table if not exists polly_infinity_chats (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references polly_threads(id) on delete cascade,   -- the Infinity Chat topic
  user_id uuid not null references polly_users(id) on delete cascade,
  voice_session_id uuid references polly_voice_sessions(id) on delete set null,  -- the free chat
  title text,                          -- a short label ("Ordering coffee")
  analysis jsonb,                      -- { fixes:[≤5], vocab:[≤8], grammar:[...], title } — null until cleaned up
  cleanup_session_id uuid references polly_voice_sessions(id) on delete set null,  -- the clean-up walk
  cleaned_up_at timestamptz,           -- set when the walk is finished
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists polly_infinity_chats_thread on polly_infinity_chats(thread_id, created_at desc);
create index if not exists polly_infinity_chats_user on polly_infinity_chats(user_id);
