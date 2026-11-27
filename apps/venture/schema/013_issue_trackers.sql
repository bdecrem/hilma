-- Tracker issues (2026-11-27, OLA-505). Bart: "create a Tracker Issue feature in our issue tracker,
-- and make one called Ola Improvement Ideas - then link that to each of things we just tried so we
-- have a record of those for later".
-- A tracker issue is not a piece of work: it lists other issues so related work can be found in one
-- place. tracker is null on an ordinary issue; on a tracker issue it is its list, in order:
-- [{ "id": "OLA-474", "note": "what was tried and what came of it" }]. A tracker issue stays 'open'
-- and is never on the plate, picked by the runner, checked or closed (scripts/venture/issues.mjs,
-- _plate.mjs). Additive only. Apply: supabase db query --linked -f <this file>.
alter table venture_issues add column if not exists tracker jsonb;
