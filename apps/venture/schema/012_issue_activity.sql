-- Each issue's Activity on the board (2026-11-18, OLA-163). Bart: "if I click on OLA 150, then I
-- should be able to add comments, and change the status, and probably even edit those tickets.
-- So make that a full-on issue tracker."
-- One row per thing that happened to an issue after this table existed: a comment, a status
-- change, an edit of a field, or the opening of an issue made on the board. Written by the board
-- (src/app/api/kochito/app/issues/, as the signed-in account, via 'board') and by Kit's command
-- line (scripts/venture/issues.mjs, via 'cli'). What a board account writes is new for Kit until
-- Kit has read it: seen_by_kit_at stays null until `issues.mjs inbox --mark`; the CLI's own rows
-- are stamped when written. Opened, started and finished before this table are read from
-- venture_issues itself, and commits from venture_commits.
-- Additive only. Service-key access only: RLS on, no policies. Apply: apps/venture/README.md,
-- "The board".
create table if not exists venture_issue_activity (
  id bigint generated always as identity primary key,
  issue_id text not null references venture_issues (id) on delete cascade,
  at timestamptz not null default now(),
  who text not null,                           -- a board account ('bart') or 'kit', 'lead', a builder
  via text not null check (via in ('board', 'cli')),
  kind text not null check (kind in ('comment', 'status', 'edit', 'opened')),
  field text,                                  -- status / edit: 'status', 'title', 'what', 'priority', 'area', 'who', 'week', 'proof'
  old_value text,
  new_value text,
  body text not null default '',               -- a comment's words, or the proof given with Done
  seen_by_kit_at timestamptz                   -- null: from the board and not yet read by Kit
);
create index if not exists venture_issue_activity_issue on venture_issue_activity (issue_id, at);
create index if not exists venture_issue_activity_unseen on venture_issue_activity (at) where seen_by_kit_at is null;
alter table venture_issue_activity enable row level security;
