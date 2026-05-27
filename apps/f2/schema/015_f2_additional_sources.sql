-- F2: let a topic accumulate multiple source materials over time.
--
-- The original URL + content stay in f2_threads.url / .content (the "primary"
-- source). Anything added later via "Additional materials" goes here as an
-- array entry: { url, content, title, added_at }.
--
-- Stored as jsonb (not a separate table) because we always read all sources
-- together when building context for chat / quiz / voice, and the cardinality
-- per topic is small (a handful of links, not thousands).

alter table f2_threads
  add column if not exists additional_sources jsonb not null default '[]'::jsonb;
