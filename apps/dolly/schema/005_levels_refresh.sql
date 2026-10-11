-- Dolly: completed levels, their refreshers, and the flag on the day (2026-10-11).
-- A level completes when every can-do of the rung is earned (a star round's
-- cards finish); the day's node gets a flag, and the level needs a refresher
-- within 7 days to stay bright (then 14, 30, 60, 90 — spaced at the level grain).
alter table dolly_days add column if not exists star_level_done int;          -- the level completed on this day, if one was

create table if not exists dolly_levels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  language text not null,
  level int not null,
  completed_at timestamptz not null default now(),
  completed_day date not null,                   -- the user's local day
  refresh_due date not null,                     -- bright until this day; due from it on
  refreshed_at timestamptz,
  refresh_count int not null default 0,
  unique (user_id, language, level)
);
create index if not exists dolly_levels_user_idx on dolly_levels (user_id);

-- One refresher attempt: a short scripted call on the level's two weakest
-- can-dos, then four cards. Passed = both demonstrated in the call.
create table if not exists dolly_refreshers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  language text not null,
  level int not null,
  day date not null,
  state text not null default 'talk',            -- talk | cards | done
  targets text[] not null,
  script jsonb,
  session_id uuid,
  seconds int,
  demonstrated text[],
  questions jsonb,
  answers jsonb not null default '[]'::jsonb,
  passed boolean,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists dolly_refreshers_user_idx on dolly_refreshers (user_id, created_at desc);

alter table dolly_levels enable row level security;
alter table dolly_refreshers enable row level security;
