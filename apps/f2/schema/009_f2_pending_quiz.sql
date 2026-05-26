-- F2: stars are no longer awarded the moment a quiz starts.
-- Track which kind of quiz is in flight; the next "complete" call awards the
-- star based on this column and clears it. Null = no quiz in progress.

alter table f2_threads
  add column if not exists pending_quiz_kind text;

alter table f2_threads
  add constraint f2_threads_pending_quiz_kind_check
    check (pending_quiz_kind is null or pending_quiz_kind in ('standard','hard'));
