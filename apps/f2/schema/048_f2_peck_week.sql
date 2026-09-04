-- Weekly Peck requirement for the daily streak: one full Peck level every
-- 7 days keeps the flame alive. peck_week_start is the PT day the current
-- 7-day clock began — set when a streak starts, whenever a full Peck set
-- is recorded, and when the agent repairs a streak. The deadline is
-- peck_week_start + 7 (inclusive); a read past that day zeroes the streak.
alter table f2_users
  add column if not exists peck_week_start date;

-- Accounts with a live streak get a fresh week at deploy so nobody is
-- broken by the rule the day it ships.
update f2_users
  set peck_week_start = (now() at time zone 'America/Los_Angeles')::date
  where peck_week_start is null
    and daily_streak > 0
    and daily_streak_date >= (now() at time zone 'America/Los_Angeles')::date - 1;
