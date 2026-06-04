-- F2: let a topic accumulate user-captured quotes from a book or article.
--
-- A quote is text the user typed with the "quote" prefix in chat. It is stored
-- against the topic it belongs to and shows up in "View context" (iOS) as its
-- own QUOTE row, alongside the topic's sources. Quotes are also folded into the
-- LLM context (buildFullContent) so chat / quiz / voice can reference them.
--
-- Stored as jsonb on the thread (not a separate table) for the same reason as
-- additional_sources: we always read every quote together when building
-- context, and the per-topic cardinality is small. Each entry: { text, created_at }.
alter table f2_threads
  add column if not exists quotes jsonb not null default '[]'::jsonb;

-- When a user types "quote <text>" outside any topic (the general Chat tab),
-- we can't yet know which topic it belongs to, so we park the text here and
-- ask. The user's next message names the target topic; we then file the quote
-- and clear this. One pending quote per user — a new "quote ..." overwrites it.
alter table f2_users
  add column if not exists pending_quote text;
