-- Onething: when the day's question actually went out. The 10pm reminder is
-- only sent if that was at least four hours ago — someone who joined at 9pm
-- and got the question in their welcome text is not nagged at 10pm. Apply in
-- the Supabase SQL editor (together with 002).

alter table onething_users
  add column if not exists prompted_at timestamptz;
