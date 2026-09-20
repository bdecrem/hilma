-- Rock Paper Anything: global daily call + token usage behind /api/rpa/judge
-- (RPA_DAILY_CALLS, default 40,000 — src/lib/rpa/usage.ts). The game has no
-- accounts, so the cap is one row per UTC day for everyone.
--
-- Apply:  supabase db query --linked -f apps/rpa/schema/001_rpa_usage.sql
-- Verify: ./scripts/db "select * from rpa_usage order by day desc limit 5"
--
-- Additive: new table + one function, nothing existing is touched.
-- Service-role only (RLS on, no policies).

create table if not exists rpa_usage (
  day          date   primary key,
  calls        bigint not null default 0,
  input_tokens bigint not null default 0
);

alter table rpa_usage enable row level security;

-- Atomic upsert-increment, one statement per Jev call.
create or replace function rpa_add_usage(p_day date, p_calls bigint, p_input bigint)
returns void
language sql
as $$
  insert into rpa_usage (day, calls, input_tokens)
  values (p_day, p_calls, p_input)
  on conflict (day) do update
    set calls        = rpa_usage.calls        + excluded.calls,
        input_tokens = rpa_usage.input_tokens + excluded.input_tokens;
$$;

revoke all on function rpa_add_usage(date, bigint, bigint) from public, anon, authenticated;
grant execute on function rpa_add_usage(date, bigint, bigint) to service_role;
