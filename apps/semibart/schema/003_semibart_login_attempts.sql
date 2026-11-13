-- CASBS Quest sign-in attempts (2026-11-12): count an attempt and check the lock in one
-- statement, so guesses sent at the same moment can't all read the same count and slip past
-- the lock. logIn calls this before it checks the passcode; a success resets the count.
-- Returns the attempt number (1..6), or null while the name is locked (6 tries, then 5 minutes).
-- Apply: supabase db query --linked -f apps/semibart/schema/003_semibart_login_attempts.sql

create or replace function semibart_try_login(p_user uuid) returns integer
language sql as $$
  update semibart_users
     set failed_attempts = case when locked_until is not null and locked_until <= now() then 1 else failed_attempts + 1 end,
         locked_until = case
           when locked_until is not null and locked_until <= now() then null
           when failed_attempts + 1 >= 6 then now() + interval '5 minutes'
           else locked_until end
   where id = p_user and (locked_until is null or locked_until <= now())
  returning failed_attempts;
$$;
