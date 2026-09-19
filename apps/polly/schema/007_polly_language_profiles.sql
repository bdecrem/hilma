-- Polly: language profiles — one account, one profile per language (2026-09-19).
--
-- "Switch language" works like switching users on Netflix: each language is
-- its own polly_users row (its own topics, cards, Peck, path, streak, level),
-- linked to the account's root row. Everything in Polly is already scoped by
-- user_id, so a profile switch is just a new session cookie for the sibling
-- row — no query anywhere has to know about languages.
--
--   account_id       null on the root row (the one that holds the email /
--                    password, or the guest name); on a sibling it points at
--                    the root. Deleting the root deletes its profiles.
--   last_profile_id  on the root: the profile that was active last, so a
--                    fresh login lands in the language the learner left.
--
-- A sibling's username is "<root username>+<lang>" (unique, never typed by
-- anyone — its password is random); /auth/me reports the root's username.

alter table polly_users
  add column if not exists account_id uuid references polly_users(id) on delete cascade,
  add column if not exists last_profile_id uuid references polly_users(id) on delete set null;

create index if not exists polly_users_account_idx
  on polly_users (account_id) where account_id is not null;
