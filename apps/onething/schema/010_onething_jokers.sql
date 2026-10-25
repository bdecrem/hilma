-- Onething: jokers (2026-10-25).
--
-- Every tenth day of a streak (10, 20, 30, …) deals a joker, three in hand at
-- most. A joker covers one missed day, for a week after it: the streak runs
-- through a covered day without counting it (jokers.ts). `jokers` is the hand;
-- `onething_saves` is one row per covered day. Playing goes through
-- onething_play_joker so the hand, the covered days and the re-chained
-- entries change together or not at all; dealing through onething_deal_joker.
--
-- The backfill gives every account the jokers its history already earned
-- (one per entry on a tenth day, three at most); nothing has been spent yet.
--
-- Apply with: supabase db query --linked -f apps/onething/schema/010_onething_jokers.sql

-- The column and its backfill together, once: applying this file again never re-deals.
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'onething_users' and column_name = 'jokers') then
    alter table onething_users add column jokers int not null default 0 check (jokers between 0 and 3);
    update onething_users u
       set jokers = least(3, (select count(*) from onething_entries e where e.user_id = u.id and e.streak > 0 and e.streak % 10 = 0));
  end if;
end $$;

create table if not exists onething_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references onething_users(id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  unique (user_id, day)
);
alter table onething_saves enable row level security;

-- One more joker in hand, unless the hand is full. Returns the hand after, or
-- null when it was full.
create or replace function onething_deal_joker(p_user uuid, p_cap int)
returns int language sql as $$
  update onething_users set jokers = jokers + 1 where id = p_user and jokers < p_cap returning jokers
$$;

-- Play: the hand goes from p_held to p_after, p_days become covered days, and
-- each p_rows entry {id, was, streak, points} is re-chained. Refuses (raises)
-- when anything moved since the plan was made: the hand, an entry's streak,
-- or a new entry after p_latest.
create or replace function onething_play_joker(p_user uuid, p_held int, p_after int, p_days date[], p_rows jsonb, p_latest date)
returns int language plpgsql as $$
declare n int;
begin
  update onething_users set jokers = p_after where id = p_user and jokers = p_held;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'onething: the jokers in hand changed'; end if;
  if exists (select 1 from onething_entries where user_id = p_user and day > p_latest) then
    raise exception 'onething: a new day landed while saving';
  end if;
  insert into onething_saves (user_id, day) select p_user, d from unnest(p_days) as d;
  update onething_entries e
     set streak = (r->>'streak')::int, points = (r->>'points')::int
    from jsonb_array_elements(p_rows) as r
   where e.id = (r->>'id')::uuid and e.user_id = p_user and e.streak = (r->>'was')::int;
  get diagnostics n = row_count;
  if n <> jsonb_array_length(p_rows) then raise exception 'onething: a day changed while saving'; end if;
  return p_after;
end $$;

revoke execute on function onething_deal_joker(uuid, int) from public, anon, authenticated;
revoke execute on function onething_play_joker(uuid, int, int, date[], jsonb, date) from public, anon, authenticated;
grant execute on function onething_deal_joker(uuid, int) to service_role;
grant execute on function onething_play_joker(uuid, int, int, date[], jsonb, date) to service_role;
