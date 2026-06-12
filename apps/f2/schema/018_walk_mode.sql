-- Peri (the walking voice app) records its Realtime sessions in the same
-- f2_voice_sessions table with mode='walk'. Widen the mode check to allow it.
alter table f2_voice_sessions
  drop constraint if exists f2_voice_sessions_mode_check;
alter table f2_voice_sessions
  add constraint f2_voice_sessions_mode_check
  check (mode in ('global', 'topic', 'walk'));
