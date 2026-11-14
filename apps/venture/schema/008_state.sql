-- Small shared state for Venture, 2026-11-14: who is working. The interactive
-- session's watchers write key "session" (a heartbeat); the runner on the Mac
-- mini writes key "runner" (running or idle, when, why). scripts/venture/runner.mjs
-- reads both so the two never work at the same time.
create table if not exists venture_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
alter table venture_state enable row level security;
