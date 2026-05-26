-- F2: iMessage pairing.
--
-- The webhook used to map every inbound iMessage to a single default user
-- via F2_DEFAULT_IMESSAGE_USER_ID. Going forward we associate handles with
-- the user who proved ownership by entering a 6-digit code we sent via
-- iMessage. The env-var fallback still applies for any handle that isn't
-- paired yet, so existing usage doesn't break.

-- Confirmed handles, one user can pair multiple (phone + iCloud address).
-- Normalized: lowercase, leading + retained for phones.
alter table f2_users
  add column if not exists imessage_handles text[] not null default '{}';

-- Helps the webhook resolve "which user owns this handle" quickly.
create index if not exists f2_users_imessage_handles_gin
  on f2_users using gin (imessage_handles);

-- Pending pairings — code + expiry. One row per (user, handle) pair; the
-- latest send overwrites prior codes for that combination.
create table if not exists f2_imessage_pending (
  user_id     uuid not null references f2_users(id) on delete cascade,
  handle      text not null,
  code        text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, handle)
);

alter table f2_imessage_pending enable row level security;

-- Best-effort cleanup of expired rows (we also filter on read).
create index if not exists f2_imessage_pending_expires_idx
  on f2_imessage_pending (expires_at);
