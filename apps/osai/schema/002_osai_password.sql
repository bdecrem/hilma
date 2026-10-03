-- osai: a reader may replace the shared passcode with a password of their own
-- (2026-10-03). One row per reader who has set one; no row = shared passcode.
create table if not exists osai_users (
  user_name text primary key,
  password_hash text not null,
  updated_at timestamptz not null default now()
);
alter table osai_users enable row level security;
