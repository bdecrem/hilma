-- The issue tracker behind the board (2026-11-17). Bart: "there should be the equivalent of an
-- issue tracker so i can see everything that was done yesterday". One row per piece of work on a
-- project (today: Ola), written by the lead and the builders with scripts/venture/issues.mjs, read
-- by app.kochitolabs.com and by morning.mjs (the plate is the open and in-progress issues).
-- Commits on main are attached by id: a commit whose subject or body says [OLA-142] belongs to
-- OLA-142 (the cron /api/venture/commits/sync reads them from GitHub every 30 minutes); an Ola
-- commit that names no issue waits in venture_commits with issue_id null ("Unsorted commits")
-- until the lead places it (issues.mjs place <sha> <id>).
-- Titles are plain words for a reader who is not an engineer. Service-key access only: RLS on,
-- no policies. Apply: see apps/venture/README.md, "The issue tracker".
create table if not exists venture_issues (
  id text primary key,                         -- 'OLA-142'
  project text not null default 'ola',
  num int not null,                            -- 142, for ordering and the next id
  title text not null,                         -- "The web app's sign-in fails in Safari: fixed"
  what text not null default '',               -- what and why, one or two sentences
  area text not null check (area in ('web', 'apps', 'model', 'security', 'ops', 'voice', 'design', 'board')),
  priority text not null default 'P1' check (priority in ('P0', 'P1', 'P2')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'done', 'dropped')),
  who text not null default 'lead',            -- 'lead', or a builder's short name
  week int check (week between 1 and 4),       -- the 30-day plan's week it serves, if any
  opened_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  day date,                                    -- the Pacific day it counts for (the day it was done or dropped)
  links jsonb not null default '[]',           -- [{ label, url }] or [{ label, doc }] (a note's slug)
  proof text not null default '',              -- what proved it: "402 checks", "his phone, by hand"
  updated_at timestamptz not null default now(),
  unique (project, num)
);
create index if not exists venture_issues_day on venture_issues (day desc);
create index if not exists venture_issues_status on venture_issues (status);
alter table venture_issues enable row level security;

create table if not exists venture_commits (
  sha text primary key,                        -- full sha
  subject text not null,
  body text not null default '',
  at timestamptz not null,                     -- the commit's date
  issue_id text references venture_issues (id) on delete set null,
  ignored boolean not null default false,      -- the lead looked and it needs no issue (issues.mjs place <sha> none)
  seen_at timestamptz not null default now()
);
create index if not exists venture_commits_issue on venture_commits (issue_id);
create index if not exists venture_commits_unsorted on venture_commits (at desc) where issue_id is null and not ignored;
alter table venture_commits enable row level security;
