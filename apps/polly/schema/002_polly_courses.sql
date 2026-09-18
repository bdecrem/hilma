-- Polly: courses — one row per language a user studies (2026-09-17).
--
-- The first-run flow picks a language before the account exists, so guest
-- and signup creation both take a language and create the course in the
-- same request. Nearly every user has exactly one course; the table (not a
-- column) is what lets a second language be added later without a
-- migration, and active_course_id is what the app and the tutor prompt
-- read today.

create table if not exists polly_courses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references polly_users(id) on delete cascade,
  -- ISO 639-1 code of the language being learned.
  language    text not null check (language in ('it', 'fr', 'ko')),
  created_at  timestamptz not null default now(),
  unique (user_id, language)
);
alter table polly_courses enable row level security;

alter table polly_users
  add column if not exists native_language text not null default 'en',
  add column if not exists active_course_id uuid references polly_courses(id) on delete set null;
