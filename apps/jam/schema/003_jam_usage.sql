-- Jam: per-user daily token usage behind the /api/jam/llm budget
-- (JAM_DAILY_TOKENS, default 3,000,000 — src/lib/jam/usage.ts).
--
-- Apply:  supabase db query --linked -f apps/jam/schema/003_jam_usage.sql
-- Verify: ./scripts/db "select * from jam_usage order by day desc limit 5"
--
-- Additive: new table + one function, nothing existing is touched.
-- Service-role only (RLS on, no policies), like jam_users / jam_tracks.

create table if not exists jam_usage (
  user_id       uuid   not null references jam_users(id) on delete cascade,
  day           date   not null,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (user_id, day)
);

alter table jam_usage enable row level security;

-- Atomic upsert-increment: one statement per Messages call, no
-- read-modify-write race between two tabs of the same user.
create or replace function jam_add_usage(p_user_id uuid, p_day date, p_input bigint, p_output bigint)
returns void
language sql
as $$
  insert into jam_usage (user_id, day, input_tokens, output_tokens)
  values (p_user_id, p_day, p_input, p_output)
  on conflict (user_id, day) do update
    set input_tokens  = jam_usage.input_tokens  + excluded.input_tokens,
        output_tokens = jam_usage.output_tokens + excluded.output_tokens;
$$;

-- Only the server (service role) may account usage.
revoke all on function jam_add_usage(uuid, date, bigint, bigint) from public, anon, authenticated;
grant execute on function jam_add_usage(uuid, date, bigint, bigint) to service_role;
