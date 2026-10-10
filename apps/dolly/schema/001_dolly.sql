-- Dolly: a three-minute call a day (2026-10-10). Apply with
--   supabase db query --linked -f apps/dolly/schema/001_dolly.sql
-- Sign-in is a phone number and a code over iMessage, sessions are HMAC
-- cookies (F2_SESSION_SECRET) — Onething's shape. The service key bypasses RLS.

create table if not exists dolly_users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,                 -- E.164
  name text,
  language text not null default 'es',        -- es | zh
  level text not null default 'new',          -- new | some | conversational
  daily_hour int not null default 8,          -- local hour of the daily text (0–23)
  tz text not null default 'America/Los_Angeles',
  streak int not null default 0,
  best_streak int not null default 0,
  last_done_day date,
  next_topic text,                            -- picked when a day completes: tomorrow's call
  prompt_day date,                            -- local day of the last daily text
  prompted_at timestamptz,
  reminder_day date,                          -- local day of the last evening reminder
  created_at timestamptz not null default now()
);

create table if not exists dolly_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dolly_codes_phone_idx on dolly_codes (phone, created_at desc);

-- One row per day a user started. `state` moves morning → after_talk →
-- after_things → done; "paused" is after_things with some answers in.
create table if not exists dolly_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  day date not null,                          -- the user's local day
  n int not null,                             -- Day N (1 = the first day started)
  topic text not null,
  state text not null default 'morning',
  call_session_id uuid,
  call_seconds int,
  things jsonb,                               -- [{kind, target, native, pinyin, source, distractors, item_id}]
  things_session_id uuid,
  questions jsonb,                            -- [{kind, native, target, pinyin, options, from, item_id}]
  answers jsonb not null default '[]'::jsonb, -- [{q, ok, answer}]
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- Everything a user has been given to keep: the pool the cards draw from
-- and what tomorrow's call works back in.
create table if not exists dolly_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  kind text not null,                         -- fix | word | phrase
  target text not null,
  native text not null,
  pinyin text,
  source text,                                -- "You said: era mucho gente" / "Dolly said: …"
  distractors jsonb,                          -- three wrong options for a pick card
  day_n int not null,
  hits int not null default 0,
  misses int not null default 0,
  last_seen date,
  created_at timestamptz not null default now(),
  unique (user_id, target)
);

create table if not exists dolly_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references dolly_users(id) on delete cascade,
  day_id uuid references dolly_days(id) on delete set null,
  mode text not null,                         -- talk | things
  engine text not null default 'eleven',
  system_prompt text,
  conversation_id text,
  transcript jsonb,
  seconds int,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index if not exists dolly_voice_sessions_user_idx on dolly_voice_sessions (user_id, started_at desc);

alter table dolly_users enable row level security;
alter table dolly_codes enable row level security;
alter table dolly_days enable row level security;
alter table dolly_items enable row level security;
alter table dolly_voice_sessions enable row level security;
