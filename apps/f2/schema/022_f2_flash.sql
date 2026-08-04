-- F2: flash cards + flash sets + XP.
--
-- Cards are generated per topic (LLM) and owned by the user; a "set" is one
-- 10-question test session (choice / text / voice), either scoped to a topic
-- or a Jumbo level (cards mixed across all the user's topics).
--
-- Star ladder (per topic, app code):
--   1 = complete the reflection/standard quiz (existing flow, now capped at 1)
--   2 = score >=9/10 on two consecutive full flash sets for the topic
--   3 = Final Review voice session judged at A grade (also sets
--       hard_quiz_completed_at as the "mastered" sentinel)
--
-- Jumbo career state is fully derived from f2_flash_sets rows with a
-- non-null jumbo_level (best score per level → node stars, pass unlocks the
-- next level). Only XP needs its own column.

create table if not exists f2_flash_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references f2_users(id) on delete cascade,
  thread_id   uuid not null references f2_threads(id) on delete cascade,
  question    text not null,
  answer      text not null,
  -- Exactly the wrong choices shown in multiple-choice mode (3 strings).
  distractors jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table f2_flash_cards enable row level security;

create index if not exists f2_flash_cards_thread_idx
  on f2_flash_cards (thread_id, created_at);
create index if not exists f2_flash_cards_user_idx
  on f2_flash_cards (user_id);

create table if not exists f2_flash_sets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references f2_users(id) on delete cascade,
  -- Topic sets carry the thread; Jumbo sets carry jumbo_level instead.
  thread_id   uuid references f2_threads(id) on delete cascade,
  jumbo_level integer,
  mode        text not null check (mode in ('choice', 'text', 'voice')),
  score       integer not null,
  total       integer not null,
  -- Per-question outcomes: [{card_id, question, answer, given, correct}]
  results     jsonb not null default '[]'::jsonb,
  xp          integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint f2_flash_sets_scope check (
    (thread_id is not null and jumbo_level is null)
    or (thread_id is null and jumbo_level is not null)
  )
);

alter table f2_flash_sets enable row level security;

create index if not exists f2_flash_sets_thread_idx
  on f2_flash_sets (thread_id, created_at desc)
  where thread_id is not null;
create index if not exists f2_flash_sets_jumbo_idx
  on f2_flash_sets (user_id, jumbo_level)
  where jumbo_level is not null;
create index if not exists f2_flash_sets_user_idx
  on f2_flash_sets (user_id, created_at desc);

-- Career XP — awarded per completed set.
alter table f2_users
  add column if not exists xp integer not null default 0;

-- New Realtime session modes: per-topic voice flash sets and the Final
-- Review (star 3) session.
alter table f2_voice_sessions
  drop constraint if exists f2_voice_sessions_mode_check;
alter table f2_voice_sessions
  add constraint f2_voice_sessions_mode_check
  check (mode in ('global', 'topic', 'walk', 'flash', 'final_review'));
