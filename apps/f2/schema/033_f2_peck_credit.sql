-- Peck credits: answers to the daily iMessage card (and its bonus
-- multiple-choice question) pre-fill the user's next Peck set, so the
-- daily play counts as steps on the map.
alter table f2_users
  add column if not exists peck_credit jsonb;
