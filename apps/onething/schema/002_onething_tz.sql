-- Onething: per-user time zone. The 10am question and the 10pm reminder go out
-- on the user's clock, not Pacific. Set on sign-in from the browser's zone;
-- iMessage joins get a guess from the country code (see tzFromPhone in
-- src/lib/onething/core.ts). Apply in the Supabase SQL editor.

alter table onething_users
  add column if not exists tz text not null default 'America/Los_Angeles';

-- Existing accounts: the Belgian number joined before this column existed.
update onething_users set tz = 'Europe/Brussels' where phone like '+32%';
