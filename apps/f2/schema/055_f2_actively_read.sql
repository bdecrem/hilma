-- Actively Read (2026-10-07): once a day Dodo picks one of the user's topics
-- that is not Actively Read yet (stars = 0) and offers it — iMessage at noon
-- PT, a push, and the top banner in the app. In a voice conversation on it
-- the user says "I'm ready" and takes a three-question test; A- or better
-- gives the topic its first star and clears the next Peck level. "Not
-- interested" (in the conversation, or "2" over iMessage) takes the topic
-- out of the daily picks for good (undo on the topic page).

-- Per topic: when it was declined for the daily pick, and when it passed
-- the Actively Read test (stars carry the standing; this is the record).
alter table f2_threads
  add column if not exists ar_inactive_at timestamptz,
  add column if not exists ar_passed_at timestamptz;

-- Per user: today's pick and what was done with it.
--   { day: 'YYYY-MM-DD' (PT), thread_id, picked_at,
--     imessage_sent_at?, push_sent_at?, resolved?: 'passed'|'declined', resolved_at? }
alter table f2_users
  add column if not exists actively_read jsonb;

-- Voice sessions accept the Actively Read mode.
alter table f2_voice_sessions drop constraint if exists f2_voice_sessions_mode_check;
alter table f2_voice_sessions add constraint f2_voice_sessions_mode_check
  check (mode = any (array['global','topic','walk','flash','final_review','second_chance','recert','actively_read']));

-- Push notifications (APNs). One row per device token; a token belongs to
-- one user at a time (signing in as someone else on the same phone moves it).
create table if not exists f2_push_tokens (
  token text primary key,
  user_id uuid not null references f2_users(id) on delete cascade,
  environment text not null check (environment in ('sandbox', 'production')),
  bundle_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set when APNs answers 410 / BadDeviceToken / Unregistered: never sent to again.
  disabled_at timestamptz
);
create index if not exists f2_push_tokens_user on f2_push_tokens (user_id) where disabled_at is null;
