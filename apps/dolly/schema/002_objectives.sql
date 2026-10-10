-- Dolly: learning objectives and the star round (2026-10-10). Apply with
--   supabase db query --linked -f apps/dolly/schema/002_objectives.sql
--
-- Opt-in per user (Settings → Learning objectives). Everyone starts at
-- level 1 and climbs the ladder in src/lib/dolly/curriculum: a level is a
-- list of can-dos; a star round (a second, guided call after the day is
-- done, then three things from its targets, then cards) is where they are
-- earned. "Talk more" (free extra calls) is for everyone and counts here too.

alter table dolly_users add column if not exists objectives boolean not null default false;
alter table dolly_users add column if not exists rung int not null default 1;   -- the ladder (level is the self-reported start)

alter table dolly_days add column if not exists extra_calls int not null default 0;
alter table dolly_days add column if not exists extra_seconds int not null default 0;
alter table dolly_days add column if not exists starred_at timestamptz;
alter table dolly_days add column if not exists star_state text;              -- null | after_talk | after_things | done
alter table dolly_days add column if not exists star_targets jsonb;           -- [cando id]
alter table dolly_days add column if not exists star_session_id uuid;
alter table dolly_days add column if not exists star_seconds int;
alter table dolly_days add column if not exists star_things jsonb;            -- same shape as things
alter table dolly_days add column if not exists star_things_session_id uuid;
alter table dolly_days add column if not exists star_questions jsonb;         -- same shape as questions
alter table dolly_days add column if not exists star_answers jsonb not null default '[]'::jsonb;
alter table dolly_days add column if not exists star_earned jsonb;            -- [cando id] earned in this round
alter table dolly_days add column if not exists star_level_up boolean not null default false;

-- A can-do the learner has demonstrated, with the line that showed it.
create table if not exists dolly_cando (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  cando_id text not null,
  level int not null,
  evidence text,
  earned_at timestamptz not null default now(),
  unique (user_id, cando_id)
);
alter table dolly_cando enable row level security;
