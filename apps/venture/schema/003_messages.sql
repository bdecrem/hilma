-- Venture: the iMessage thread between Bart and Claude, and where each
-- private document came from (so another machine can restore the files).
create table if not exists venture_messages (
  id bigint generated always as identity primary key,
  direction text not null check (direction in ('in', 'out')),
  -- out: 'session' (the working Claude Code session) or 'reply' (the answer
  -- written on the server the moment Bart's text arrives). in: 'bart'.
  author text not null,
  text text not null,
  at timestamptz not null default now(),
  -- when the working session read an inbound message
  seen_at timestamptz
);
create index if not exists venture_messages_unseen on venture_messages (id) where direction = 'in' and seen_at is null;
alter table venture_messages enable row level security;

alter table venture_docs add column if not exists source text;
