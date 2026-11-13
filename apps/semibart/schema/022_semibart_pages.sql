-- CASBS Quest, loose leaves (2026-11-13). The oaks on campus drop a loose leaf now and then: a
-- page of a manuscript. A fellow who picks one up adds a page to the stack on their own desk; ten
-- pages make the book. One row per character.
-- Apply: supabase db query --linked -f apps/semibart/schema/022_semibart_pages.sql
create table if not exists semibart_pages (
  character text primary key,                 -- the game's slug: 'mary'
  pages int not null default 0 check (pages between 0 and 10),
  last_at timestamptz not null default now()
);
alter table semibart_pages enable row level security;

-- Pick up a leaf: one more page, at most ten, and not faster than one every eight seconds (the
-- game drops them much more slowly than that). One statement, so two tabs cannot double count.
-- Returns the page count after the pick, or null when nothing was added.
create or replace function semibart_pick_leaf(p_character text) returns integer
language plpgsql as $$
declare n integer;
begin
  insert into semibart_pages (character, pages, last_at) values (p_character, 0, now() - interval '1 hour') on conflict (character) do nothing;
  update semibart_pages set pages = pages + 1, last_at = now()
    where character = p_character and pages < 10 and last_at < now() - interval '8 seconds'
    returning pages into n;
  return n;
end $$;
revoke all on function semibart_pick_leaf(text) from public, anon, authenticated;
grant execute on function semibart_pick_leaf(text) to service_role;
