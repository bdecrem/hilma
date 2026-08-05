-- F2 flash: user ratings + spaced-repetition state per card.
--
-- rating (user's verdict on the card itself, not their answer):
--   'down'     = thumbs down — bury it, never serve it in a set again
--   'priority' = double thumbs up — resurface aggressively until mastered,
--                then keep it in occasional rotation
--   null       = normal card
--
-- Scheduling state is SM-2 (SuperMemo 2, the classic Anki scheduler),
-- computed in src/lib/f2/flash.ts. `due_at` is what set selection reads;
-- the rest is the state SM-2 needs to compute the next due date.
alter table f2_flash_cards
  add column if not exists rating text
    check (rating is null or rating in ('down', 'priority')),
  add column if not exists rated_at timestamptz,
  -- Exposure history — how often and how recently this card has been served.
  add column if not exists times_shown integer not null default 0,
  add column if not exists last_shown_at timestamptz,
  -- SM-2 state.
  add column if not exists reps integer not null default 0,
  add column if not exists lapses integer not null default 0,
  add column if not exists ease numeric(4,2) not null default 2.5,
  -- Two intervals on purpose. `interval_days` is the pure SM-2 model output
  -- and is the only thing the algorithm mutates; `scheduled_days` is that
  -- value after the priority/mastery clamps and is what sets due_at.
  -- Mastery is tested against the UNCLAMPED one — otherwise a priority card
  -- pinned to a 3-day loop could never reach the 21-day mastery bar and
  -- would be trapped in aggressive rotation forever.
  add column if not exists interval_days numeric(8,2) not null default 0,
  add column if not exists scheduled_days numeric(8,2) not null default 0,
  add column if not exists due_at timestamptz,
  -- Consecutive correct answers — drives the "mastered" threshold.
  add column if not exists streak integer not null default 0;

-- Set selection filters on (user, rating) and orders by due_at, so index the
-- pair. Buried cards are excluded by every query, hence the partial index.
create index if not exists f2_flash_cards_due_idx
  on f2_flash_cards (user_id, due_at)
  where rating is distinct from 'down';

create index if not exists f2_flash_cards_rating_idx
  on f2_flash_cards (user_id, rating)
  where rating is not null;

-- Bump exposure counters for a whole set in one statement. Needs to be a
-- function because PostgREST can't express `times_shown = times_shown + 1`.
create or replace function f2_mark_cards_shown(
  p_user_id uuid,
  p_card_ids uuid[],
  p_now timestamptz
) returns void
language sql
security definer
set search_path = public
as $$
  update f2_flash_cards
     set times_shown   = times_shown + 1,
         last_shown_at = p_now
   where user_id = p_user_id
     and id = any(p_card_ids);
$$;
