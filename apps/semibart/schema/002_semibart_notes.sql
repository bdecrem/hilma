-- CASBS Quest sticky notes (2026-11-12): a signed-in fellow leaves a short note for another,
-- and it shows up stuck to the front of their desk. Anyone who walks in sees that there are
-- notes; only the person it's for, its author and an admin can read it.
-- Apply: supabase db query --linked -f apps/semibart/schema/002_semibart_notes.sql

create table if not exists semibart_notes (
  id uuid primary key default gen_random_uuid(),
  to_user uuid not null references semibart_users(id) on delete cascade,
  from_user uuid not null references semibart_users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 140),
  color text not null default 'yellow' check (color in ('yellow', 'pink', 'blue', 'green')),
  created_at timestamptz not null default now(),
  removed_at timestamptz                      -- taken down by its reader, its author or an admin
);
create index if not exists semibart_notes_to on semibart_notes (to_user, created_at desc) where removed_at is null;
create index if not exists semibart_notes_from_day on semibart_notes (from_user, created_at desc);
alter table semibart_notes enable row level security;
