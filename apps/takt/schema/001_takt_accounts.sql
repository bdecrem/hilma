-- Takt accounts (2026-10-25): Dodo's shape (guest on first launch, claimed by email +
-- password, a signed session cookie), in tables of its own.
-- Apply: supabase db query --linked -f apps/takt/schema/001_takt_accounts.sql

create table if not exists takt_users (
  id uuid primary key default gen_random_uuid(),
  -- Lowercased; null while the account is a guest.
  email text unique,
  password_hash text not null,
  is_guest boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- The app's ProgressStore snapshot ({ lessons, skills }), one row per user.
create table if not exists takt_progress (
  user_id uuid primary key references takt_users(id) on delete cascade,
  snapshot jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Only the server (service key) reads or writes these.
alter table takt_users enable row level security;
alter table takt_progress enable row level security;
