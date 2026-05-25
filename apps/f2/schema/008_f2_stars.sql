-- F2: per-topic stars + hard-quiz tracking.
-- Stars are monotonic 0..3:
--   1 = first standard quiz completed
--   2 = second standard quiz completed
--   3 = hard quiz completed (regardless of order)
-- Levels are derived from count of topics with stars >= 1 (computed in app code,
-- not stored).

alter table f2_threads
  add column if not exists stars smallint not null default 0;

alter table f2_threads
  add column if not exists hard_quiz_completed_at timestamptz;

alter table f2_threads
  add constraint f2_threads_stars_range check (stars between 0 and 3);

-- Backfill from existing quiz_count. Hard quizzes didn't exist before this
-- migration, so the ceiling here is 2.
update f2_threads
set stars = least(2, quiz_count)
where quiz_count > 0 and stars = 0;

-- Helps the progress endpoint count starred topics per user fast.
create index if not exists f2_threads_user_stars_idx
  on f2_threads (user_id) where stars > 0;
