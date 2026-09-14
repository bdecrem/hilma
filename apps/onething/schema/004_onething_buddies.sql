-- Onething: buddy streaks and names (2026-09-14).
--
-- A buddy streak is between two people: it counts a day when both wrote, a
-- miss by either resets it to zero, and every 7 days it holds both get 25
-- bonus points. Nothing else is shared — personal streaks and points are
-- untouched. As many buddies as you like; each pair is its own row.
--
-- A name is what buddies see instead of a number. Asked once by text (the
-- moment someone accepts an invite over iMessage) — name_asked_at records
-- that it was asked, so it is never asked again — or set in settings.
--
-- Apply with: supabase db query --linked -f apps/onething/schema/004_onething_buddies.sql

alter table onething_users
  add column if not exists name text,
  add column if not exists name_asked_at timestamptz;

create table if not exists onething_buddies (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references onething_users(id) on delete cascade,
  invitee_handle text not null,           -- E.164 or an iCloud email, as typed into settings (normalized)
  invitee_id uuid references onething_users(id) on delete cascade, -- set on accept
  status text not null default 'pending', -- pending | active | ended
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  start_day date,                         -- the first day that counts: the day after acceptance
  ended_at timestamptz,
  ended_by uuid references onething_users(id),
  streak int not null default 0,          -- consecutive days both kept, as last computed
  best int not null default 0,
  last_bonus_day date                     -- the day the last 7-day bonus was paid, so it is paid once
);

create index if not exists onething_buddies_inviter on onething_buddies(inviter_id);
create index if not exists onething_buddies_invitee on onething_buddies(invitee_id);
create index if not exists onething_buddies_handle on onething_buddies(invitee_handle) where status = 'pending';
