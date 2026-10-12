-- Dolly: level chunks a learner hid from their stash (2026-10-11). Apply with
--   supabase db query --linked -f apps/dolly/schema/007_hidden_chunks.sql
-- A chunk is "<cando id>:<target>" (src/lib/dolly/chunks.ts); hidden ones stay
-- out of flash sets and are listed dimmed in Your cards, with a way back.
alter table dolly_users add column if not exists hidden_chunks text[] not null default '{}';
