-- F2: community-shared topics.
--
-- A share is a POINTER to the owner's live thread, not a snapshot — the
-- directory always reflects the original, and deleting the original (or the
-- owner) removes the listing via cascade. Forking copies the material into
-- the forker's own brand-new thread at fork time (sources + notes + flash
-- cards; never chat history, stars, or study focus), so edits on a fork
-- touch only the fork.
--
-- Deliberately minimal for v1: ratings, reports, and author pages can hang
-- off this table later without reshaping it.

create table if not exists f2_community_topics (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null unique references f2_threads(id) on delete cascade,
  user_id    uuid not null references f2_users(id) on delete cascade,
  shared_at  timestamptz not null default now()
);

alter table f2_community_topics enable row level security;

create index if not exists f2_community_topics_shared_idx
  on f2_community_topics (shared_at desc);
