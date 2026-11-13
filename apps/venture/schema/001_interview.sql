-- Venture: the founding interview. One row per spoken turn of the voice call
-- at ola.cx/venture/interview (role claude = the interviewer's words, bart =
-- his transcribed answers, event = started / resumed / ended markers).
-- Service-key access only: RLS on, no policies.

create table if not exists venture_interview_turns (
  id bigserial primary key,
  session uuid not null,
  role text not null check (role in ('claude', 'bart', 'event')),
  text text not null,
  at timestamptz not null default now()
);

create index if not exists venture_interview_turns_session on venture_interview_turns (session, id);

alter table venture_interview_turns enable row level security;
