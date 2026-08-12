-- Second Chance: a 3-question retake offered after a failed Final Review.
--
-- Grades are now recorded on the voice session row (grade + graded_at +
-- grade_detail) so eligibility can be computed from history: 2+ graded full
-- Final Review attempts, the latest below A and within 24 hours. Second
-- Chance sessions use mode='second_chance' so they never count as full
-- attempts.

alter table f2_voice_sessions
  add column if not exists grade text,
  add column if not exists graded_at timestamptz,
  add column if not exists grade_detail jsonb;

alter table f2_voice_sessions
  drop constraint if exists f2_voice_sessions_mode_check;
alter table f2_voice_sessions
  add constraint f2_voice_sessions_mode_check
  check (mode in ('global', 'topic', 'walk', 'flash', 'final_review', 'second_chance'));
