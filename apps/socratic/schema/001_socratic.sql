-- Socratic (hilma /socratic): study sessions + turns.
--
-- Apply:  ./scripts/db < apps/socratic/schema/001_socratic.sql
-- Verify: ./scripts/db "select column_name, data_type from information_schema.columns where table_name='soc_turns' order by ordinal_position"
--
-- No accounts: a session belongs to a participant code (whatever the study
-- platform, e.g. oTree, passes in ?pid=) and a study arm (A/B/C). Both
-- tables are service-role only (RLS on, no policies): the Next.js routes
-- are the only client.

create extension if not exists pgcrypto;

create table if not exists soc_sessions (
  id           uuid primary key default gen_random_uuid(),
  participant  text not null,
  -- A = plain assistant, B = Socratic script, C = Socratic + coach agent
  arm          text not null check (arm in ('A', 'B', 'C')),
  module       text not null,
  -- overview | readiness | questioning | mastery | done (tutor-reported)
  phase        text not null default 'overview',
  -- { holding, structure, both_sides, line_drawing } booleans
  mastery      jsonb not null default '{}'::jsonb,
  turns        integer not null default 0,
  tutor_model  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  ended_at     timestamptz
);

create index if not exists soc_sessions_created on soc_sessions (created_at desc);
create index if not exists soc_sessions_participant on soc_sessions (participant, created_at desc);

create table if not exists soc_turns (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references soc_sessions(id) on delete cascade,
  idx         integer not null,
  role        text not null check (role in ('student', 'tutor')),
  content     text not null,
  -- the synthetic opening message that asks the tutor to begin
  hidden      boolean not null default false,
  -- tutor: { phase, move, student_answer, mastery } (self-report)
  -- student: the observer's verdict { answer_type, quality, doctrinal_error, recommended_move, rationale }
  meta        jsonb,
  -- arm C: the coach note appended to this student message for the tutor
  coach       text,
  usage       jsonb,
  latency_ms  integer,
  model       text,
  created_at  timestamptz not null default now(),
  unique (session_id, idx)
);

alter table soc_sessions enable row level security;
alter table soc_turns    enable row level security;
