-- CASBS Quest rooms as data (2026-11-12): what a fellow has added to their study is a
-- piece of drawing code saved here, not a deploy. The game (public/semibart/rooms.js) loads
-- it and runs it over the room; the decorator (src/lib/semibart/room-agent.ts) writes it.
-- Apply: supabase db query --linked -f apps/semibart/schema/010_semibart_rooms.sql

-- One row per room that has ever been decorated. `room` is the game's room key: the
-- lowercase slug of the study's host ('daniel', 'bart'; 'kevin' for the three in Study 27).
create table if not exists semibart_rooms (
  room text primary key,
  -- Counts saved changes; 0 means nothing yet. The game reloads a room when this moves.
  version int not null default 0,
  -- The body of a function that returns { back, front, spots }. '' draws nothing.
  code text not null default '',
  -- Set while the decorator is at work on this room, so two requests never race.
  busy_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Every saved version is kept, so a room rolls back: an undo is a new version holding the
-- older code, and the history stays linear.
create table if not exists semibart_room_versions (
  id bigint generated always as identity primary key,
  room text not null references semibart_rooms(room) on delete cascade,
  version int not null,
  code text not null,
  -- What the fellow asked for, and the one line the decorator said back.
  prompt text not null default '',
  say text not null default '',
  -- semibart_users.id of who asked (text, so this file stands without the accounts tables).
  author text not null default '',
  kind text not null default 'decorate' check (kind in ('decorate', 'undo')),
  created_at timestamptz not null default now(),
  unique (room, version)
);
create index if not exists semibart_room_versions_recent on semibart_room_versions (room, created_at desc);

-- Only the server (service key) reads or writes these.
alter table semibart_rooms enable row level security;
alter table semibart_room_versions enable row level security;

-- Take a room for p_seconds while the decorator works on it; false when someone else has it.
-- One statement on the database's own clock, so two requests can never both win. (The same
-- thing through the REST filter API does not work: an `or` filter on an update is checked
-- against the row after the change.)
create or replace function semibart_claim_room(p_room text, p_seconds int) returns boolean
language plpgsql as $$
begin
  insert into semibart_rooms (room) values (p_room) on conflict (room) do nothing;
  update semibart_rooms set busy_until = now() + make_interval(secs => p_seconds)
    where room = p_room and (busy_until is null or busy_until < now());
  return found;
end $$;
revoke all on function semibart_claim_room(text, int) from public, anon, authenticated;
grant execute on function semibart_claim_room(text, int) to service_role;
