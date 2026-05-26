-- F2: email-based signup.
-- Add an email column on f2_users. Existing rows (bart) keep email = null and
-- continue to log in by their `username`. New signups have username =
-- lowercased email so login works either way (the auth lookup is by username).

alter table f2_users
  add column if not exists email text;

-- Email is optional, but when present it must be unique.
create unique index if not exists f2_users_email_lower_uniq
  on f2_users (lower(email))
  where email is not null;
