-- One send time for everything Dodo texts once a day (2026-10-16): the daily
-- card, Today's read (Actively Read) and the Daily Voice Checkin all go out
-- at the hour the user picks, in the user's own time zone — one hourly cron
-- (/api/f2/daily/tick) instead of three fixed PT crons (9 am card, noon read,
-- 5 pm checkin). Today's read also gets its own toggle; before this it rode
-- on the card OR the checkin being on.
alter table f2_users
  add column if not exists actively_read_enabled boolean not null default true,
  -- 0–23, the user's local hour.
  add column if not exists daily_hour smallint not null default 9
    check (daily_hour >= 0 and daily_hour <= 23),
  -- An IANA zone, sent by the app from the device.
  add column if not exists daily_tz text not null default 'America/Los_Angeles';
