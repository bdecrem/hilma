-- Atomic XP increment. recordFlashSet previously did a read-modify-write,
-- which could lose XP when the same account submits two sets concurrently
-- (phone + Mac). One statement, no race; returns the new total.

create or replace function f2_add_xp(p_user_id uuid, p_amount int)
returns int
language sql
as $$
  update f2_users
  set xp = coalesce(xp, 0) + p_amount,
      updated_at = now()
  where id = p_user_id
  returning xp;
$$;
