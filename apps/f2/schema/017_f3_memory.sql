-- F3 (Loci): the memory layer on top of F2 topics.
--
-- F2 stopped at quiz completion (stars). F3 adds what stars never measured:
-- whether you still remember the material next week. Each topic gets distilled
-- into atomic "idea cards" (f3_cards); a spaced-repetition scheduler decides
-- when each one is due; every recall attempt is logged (f3_reviews).
--
-- Cards live in their own table (unlike messages/quotes, which are jsonb on
-- the thread) because the hot query is cross-topic: "all cards due now for
-- this user", ordered by due_at. That's an indexed scan here and a mess as
-- jsonb.

create table if not exists f3_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references f2_users(id) on delete cascade,
  thread_id uuid not null references f2_threads(id) on delete cascade,

  -- The recall question, self-contained (answerable without the source open),
  -- and the canonical answer it is graded against.
  prompt text not null,
  answer text not null,

  -- Scheduler state (simplified SM-2, three grades: 0 forgot / 1 shaky / 2 solid).
  -- 'new' = never reviewed; 'learning' = seen but not yet graduated;
  -- 'review' = graduated, on the growing-interval track.
  state text not null default 'new' check (state in ('new', 'learning', 'review')),
  due_at timestamptz not null default now(),
  interval_days double precision not null default 0,
  ease double precision not null default 2.5,
  reps int not null default 0,
  lapses int not null default 0,
  last_reviewed_at timestamptz,
  last_grade int,

  -- Soft delete: suspended cards never enter the queue but keep their history.
  suspended boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The review-queue query: everything due for a user, oldest due first.
create index if not exists f3_cards_due_idx
  on f3_cards (user_id, due_at)
  where not suspended;

create index if not exists f3_cards_thread_idx
  on f3_cards (thread_id);

alter table f3_cards enable row level security;

-- One row per recall attempt — the raw record the streak, daily counts, and
-- any future tuning of the scheduler are computed from.
create table if not exists f3_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references f2_users(id) on delete cascade,
  card_id uuid not null references f3_cards(id) on delete cascade,
  thread_id uuid not null,
  user_answer text not null default '',
  grade int not null check (grade between 0 and 2),
  -- 'llm' = typed answer graded by the model; 'self' = user revealed the
  -- answer and rated themselves.
  graded_by text not null default 'llm' check (graded_by in ('llm', 'self')),
  feedback text,
  interval_days double precision not null,
  due_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists f3_reviews_user_idx
  on f3_reviews (user_id, created_at desc);

alter table f3_reviews enable row level security;

-- Primer questions ("read/watch for these") generated when a source lands,
-- before the user consumes it — the attention half of the system. Small,
-- always read with the thread → jsonb array of strings on the thread row.
alter table f2_threads
  add column if not exists primer jsonb;
