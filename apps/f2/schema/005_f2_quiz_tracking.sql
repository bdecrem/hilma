-- F2: track quiz activity per thread for smarter quiz scheduling.
-- created_at already records when the URL/topic was added (001).
-- These two columns let the agent reason about quiz recency + frequency.

alter table f2_threads add column if not exists last_quizzed_at timestamptz;
alter table f2_threads add column if not exists quiz_count integer not null default 0;
