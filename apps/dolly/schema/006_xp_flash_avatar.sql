-- Dolly: XP and ranks, flash card sets, the avatar (2026-10-11). Apply with
--   supabase db query --linked -f apps/dolly/schema/006_xp_flash_avatar.sql
--
-- XP is a ledger: one row per thing earned, unique on (kind, ref) so a
-- retried request or a day done over never pays twice, and the total is the
-- sum. Ranks (Hatchling … Lyrebird) are thresholds on the total in
-- src/lib/dolly/xp.ts; nothing is ever taken away.
alter table dolly_users add column if not exists avatar text;   -- a jelly critter kind (src/lib/dolly/avatar.ts); null = picked from the id

create table if not exists dolly_xp (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  day date not null,                             -- the user's local day it was earned
  kind text not null,                            -- talk | things | card | cards_clean | day | streak | more | star | cando | level | refresh | flash | flash_clean
  ref text not null,                             -- what it was for (a day id, "day:q", a can-do id, a set id …)
  amount int not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists dolly_xp_user_day_idx on dolly_xp (user_id, day);

-- A flash card set: ten cards dealt on demand after the day, half from the
-- learner's own words, half from the level's grammar chunks, in both
-- directions, pick and type by turns. Leaving one and dealing another drops it.
create table if not exists dolly_flash_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  language text not null,
  day date not null,
  state text not null default 'open',            -- open | done
  questions jsonb not null,
  answers jsonb not null default '[]'::jsonb,
  xp int not null default 0,                     -- what it paid when it finished
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists dolly_flash_sets_user_idx on dolly_flash_sets (user_id, created_at desc);

alter table dolly_xp enable row level security;
alter table dolly_flash_sets enable row level security;
