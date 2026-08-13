-- Daily flash card over iMessage: a phone number on the profile drives the
-- daily send, and daily_card holds the in-flight question awaiting the
-- user's freeform answer.
alter table f2_users
  add column if not exists phone text,
  add column if not exists daily_card jsonb;
