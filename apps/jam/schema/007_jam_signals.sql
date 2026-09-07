-- Taste v2 (2026-09-06): implicit signals. jam_votes.source now also takes
-- 'correction' (a follow-up message that contradicts the last turn, mined by
-- /api/jam/llm), 'praise', 'bounce' and 'publish'. `calls` keeps the turn's
-- tool calls with their inputs (parameter attribution), `reason` the miner's
-- one-line summary.
--
-- Apply:  supabase db query --linked -f apps/jam/schema/007_jam_signals.sql

alter table jam_votes
  add column if not exists calls  jsonb,
  add column if not exists reason text;

create index if not exists jam_votes_user_source on jam_votes (user_id, source);
