-- Admins (2026-10-02): the app shows admin-only settings, starting with
-- "Dev mode" (every Peck minigame open from the map). Bart is the only one.
alter table f2_users
  add column if not exists is_admin boolean not null default false;

update f2_users set is_admin = true where username = 'bart';
