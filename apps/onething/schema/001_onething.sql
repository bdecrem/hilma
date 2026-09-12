-- Onething: one sentence a day, prompted over iMessage, with a streak.
-- These tables already existed in the project (created 2026-09-12, empty)
-- before the code landed; this file records their shape. The exec_sql RPC
-- is SELECT-only, so any change here has to go through the Supabase SQL editor.
--
-- Streak and points are not stored on the user: each entry carries the
-- streak as of that day and the cumulative points after it, so the latest
-- entry is the user's scoreboard. Sessions are HMAC cookies (F2_SESSION_SECRET).

create table if not exists onething_users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,             -- E.164
  created_at timestamptz not null default now(),
  prompt_day date,                        -- local day of the last 10am prompt
  reminder_day date                       -- local day of the last 10pm reminder
);

create table if not exists onething_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references onething_users(id) on delete cascade,
  day date not null,
  text text not null,
  streak int not null default 0,          -- streak as of this entry
  points int not null default 0,          -- cumulative points after this entry
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);

create table if not exists onething_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,                -- sha256 of the 6-digit code
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
