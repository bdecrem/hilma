-- Daily-card streak: consecutive PT days with a graded daily iMessage
-- answer. daily_streak_date is the last PT day that counted; the live value
-- is computed as 0 when that date is older than yesterday (no cron needed).
alter table f2_users
  add column if not exists daily_streak integer not null default 0,
  add column if not exists daily_streak_date date;
