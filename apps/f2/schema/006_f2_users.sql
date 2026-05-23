-- F2: introduce users + per-user scoping of threads.
-- First auth layer in hilma. For now, just one user (bart) seeded for the web app;
-- iMessage traffic is mapped to this same user via F2_DEFAULT_IMESSAGE_USER_ID env var
-- in the webhook handler. A later migration will generalize iMessage handle → user mapping.

create table if not exists f2_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table f2_users enable row level security;

-- Seed bart. Password is '1102' (bcryptjs, cost 10). Generated locally.
insert into f2_users (username, password_hash)
values ('bart', '$2b$10$18/WROgvSP6zb35Z2Tr.7eIYXnyDQutwdtQnVz3TANm9Q5286YKT2')
on conflict (username) do nothing;

-- Link existing and future threads to a user.
alter table f2_threads
  add column if not exists user_id uuid references f2_users(id) on delete cascade;

-- Backfill: every pre-existing thread belongs to bart.
update f2_threads
set user_id = (select id from f2_users where username = 'bart')
where user_id is null;

alter table f2_threads alter column user_id set not null;

create index if not exists f2_threads_user_updated_idx
  on f2_threads (user_id, updated_at desc);
