-- F2: add a third quiz kind, 'reflection', for stories where the value is
-- personal takeaway rather than factual recall.
--
-- Behavior in app code:
--   - Awards exactly 1 star on completion (regardless of prior star count).
--   - Marks `hard_quiz_completed_at = now()` so the topic is locked — no
--     further quizzes are offered for that thread.
--   - No grading; honor system like Quiz 1.

alter table f2_threads
  drop constraint if exists f2_threads_pending_quiz_kind_check;

alter table f2_threads
  add constraint f2_threads_pending_quiz_kind_check
    check (pending_quiz_kind is null or pending_quiz_kind in ('standard','hard','reflection'));
