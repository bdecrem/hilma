-- Sign-in attempts at app.kochitolabs.com (Kit's page for Bart), 2026-11-14.
-- The passcodes are short, so wrong tries are counted and capped:
-- src/lib/kochito/app-auth.ts refuses an address after 5 wrong tries in an
-- hour and everyone after 30 in a day. A signed-in browser is not affected.
create table if not exists kochito_logins (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  ip text not null,
  username text,
  ok boolean not null
);
create index if not exists kochito_logins_fail on kochito_logins (at) where not ok;
alter table kochito_logins enable row level security;
