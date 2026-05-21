-- F2 v0: one table.
-- A "thread" = a URL the user sent in by SMS, plus the chat about it.
-- Phone number is identity (SMS is primary UI, no separate users table yet).
-- Messages stored inline as JSONB array, Feynd-style — single-row update per turn.

create table if not exists f2_threads (
  id          uuid        primary key default gen_random_uuid(),
  phone       text        not null,
  url         text        not null,
  content     text,                                      -- fetched/extracted body (cached)
  messages    jsonb       not null default '[]'::jsonb,  -- [{role,text,created_at,source}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists f2_threads_phone_updated_idx
  on f2_threads (phone, updated_at desc);

-- RLS on, no policies = service key access only (matches sms-bot pattern).
alter table f2_threads enable row level security;
