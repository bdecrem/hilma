-- F2: support topic-only threads (no URL required).
-- Threads can now be identified by either a URL (fetched source) or a topic name.

alter table f2_threads alter column url drop not null;
alter table f2_threads add column if not exists topic text;
