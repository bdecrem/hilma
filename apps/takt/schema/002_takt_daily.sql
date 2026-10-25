-- Takt daily text (2026-10-25): one iMessage a day at the user's hour, unless they already
-- practiced that day. Phone verified by a 4-digit code; the hourly tick
-- (/api/takt/daily/tick) marks daily_sent_on with the user's local date.
-- Apply: supabase db query --linked -f apps/takt/schema/002_takt_daily.sql

alter table takt_users add column if not exists phone text;
alter table takt_users add column if not exists phone_verified_at timestamptz;
alter table takt_users add column if not exists phone_code text;
alter table takt_users add column if not exists phone_code_expires_at timestamptz;
alter table takt_users add column if not exists daily_enabled boolean not null default true;
alter table takt_users add column if not exists daily_hour int not null default 9;
alter table takt_users add column if not exists daily_tz text not null default 'America/Los_Angeles';
alter table takt_users add column if not exists daily_sent_on date;
