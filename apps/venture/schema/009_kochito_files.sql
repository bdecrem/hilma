-- Files a customer sent us (2026-11-14). The service page promises that
-- documents "are deleted 30 days after delivery, or sooner on request"; this
-- table is how that promise is kept. One row per file received: where it is
-- kept (private storage bucket `kochito-files`), when the fixed version was
-- delivered, and when the copies were deleted. scripts/venture/files.mjs lists
-- what is held, marks a delivery and deletes what is due.
create table if not exists kochito_files (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null default 'mail',  -- 'mail' (an attachment) | 'link' (fetched from a link they gave) | 'watch' (found on a page we watch for them)
  mail_id bigint,                       -- kochito_mail.id, for an attachment
  from_addr text,                       -- who it came from
  name text not null,                   -- the file's own name
  path text,                            -- in the bucket; null once deleted
  bytes bigint not null default 0,
  content_type text,
  delivered_at timestamptz,             -- when the fixed file went back
  delete_after timestamptz,             -- delivered_at + 30 days, or earlier on request
  deleted_at timestamptz
);
create index if not exists kochito_files_held on kochito_files (delete_after) where deleted_at is null;
alter table kochito_files enable row level security;
