-- Daily Voice Checkin (2026-10-12). Once a day Dodo picks one of the user's
-- active topics (any kind: books, mini topics, everything that is not
-- Inactive), writes ONE high-level question about it, and texts it over
-- iMessage with a link into a voice chat (feynd.cc/checkin/<topic id>). In
-- the chat Dodo asks that question, grades the answer pass/fail out loud; on
-- a fail it explains the idea and asks once more (the second chance). The
-- transcript is graded afterwards (judgeVoiceCheckin in flash.ts); an attempt
-- counts toward the daily streak like a daily-card answer. "9" over iMessage
-- makes the topic Inactive — a new topic type that leaves every daily pool.

-- The new user-set topic type.
alter table f2_threads
  drop constraint if exists f2_threads_kind_check;
alter table f2_threads
  add constraint f2_threads_kind_check
    check (kind in ('chat', 'web', 'audio', 'video', 'paste', 'fallback',
                    'book', 'mini', 'general', 'inactive'));

-- Per user: the Settings toggle, and today's checkin.
--   { day: 'YYYY-MM-DD' (PT), thread_id, question, picked_at,
--     imessage_sent_at?, resolved?: 'passed'|'failed'|'inactive', resolved_at?,
--     voice_session_id? }
alter table f2_users
  add column if not exists voice_checkin_enabled boolean not null default true,
  add column if not exists voice_checkin jsonb;

-- Voice sessions accept the checkin mode.
alter table f2_voice_sessions drop constraint if exists f2_voice_sessions_mode_check;
alter table f2_voice_sessions add constraint f2_voice_sessions_mode_check
  check (mode = any (array['global','topic','walk','flash','final_review','second_chance','recert','actively_read','voice_checkin']));
