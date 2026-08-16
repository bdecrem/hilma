-- F2: artifacts — keepsakes the learner saves, quotes first. Loosely tied to
-- a topic (the source line/chip), browsed together in the Pebbles carousel
-- and shown one-at-random on the flash grading screen.
create table if not exists f2_artifacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references f2_users(id) on delete cascade,
  thread_id  uuid references f2_threads(id) on delete set null,
  kind       text not null default 'quote',
  body       text not null,
  source     text,
  created_at timestamptz not null default now()
);

alter table f2_artifacts enable row level security;

create index if not exists f2_artifacts_user_created_idx
  on f2_artifacts (user_id, created_at desc);
