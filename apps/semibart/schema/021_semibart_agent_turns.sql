-- CASBS Quest: one row per message a fellow sends to their room's Claude, so the chat has a
-- daily allowance (each message is one to five model calls). Server: social.ts (countTurn).
-- Apply: supabase db query --linked -f apps/semibart/schema/021_semibart_agent_turns.sql
create table if not exists semibart_agent_turns (
  id bigint generated always as identity primary key,
  character text not null,                    -- who asked: 'bart'
  room text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists semibart_agent_turns_recent on semibart_agent_turns (character, created_at desc);
alter table semibart_agent_turns enable row level security;
