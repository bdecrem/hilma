-- Guests + the refresher toggle.
--
-- is_guest: accounts auto-created on first app run (try-before-signup).
-- Claiming (signup from a guest session) flips it off and sets real
-- credentials on the SAME row, keeping all progress.
--
-- recert_enabled: the Settings "Refresher" toggle. Off = mastery is
-- forever — recert due dates are stripped from topic payloads and no
-- refresher nudges go out.
alter table f2_users
  add column if not exists is_guest boolean not null default false,
  add column if not exists recert_enabled boolean not null default true;
