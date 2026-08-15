-- Recertification: the gold badge is renewable. recert_due_at is set on
-- every certification/renewal; "lapsed" is derived (now > recert_due_at),
-- never stored. Stage maps to the expanding interval ladder 30/60/90/90...
alter table f2_threads
  add column if not exists recert_stage int not null default 0,
  add column if not exists recert_due_at timestamptz;

-- Backfill existing certified topics with at least a week of notice.
update f2_threads
  set recert_due_at = greatest(now() + interval '7 days',
                               coalesce(hard_quiz_completed_at, now()) + interval '30 days')
  where stars >= 3 and recert_due_at is null;

-- Voice sessions accept the refresher mode.
alter table f2_voice_sessions drop constraint if exists f2_voice_sessions_mode_check;
alter table f2_voice_sessions add constraint f2_voice_sessions_mode_check
  check (mode = any (array['global','topic','walk','flash','final_review','second_chance','recert']));
