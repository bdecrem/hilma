-- Venture: the daily call and the private documents.
-- The repo is public, so what Claude and Bart say to each other about the
-- business lives here, not in files: a call's agenda (venture_calls) and the
-- pages Bart reads (venture_docs, markdown), both served only behind the key.

create table if not exists venture_calls (
  slug text primary key,
  title text not null,
  blurb text not null default '',
  brief text not null,
  created_at timestamptz not null default now()
);

create table if not exists venture_docs (
  slug text primary key,
  title text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table venture_interview_turns add column if not exists call text not null default 'founding';

alter table venture_calls enable row level security;
alter table venture_docs enable row level security;
