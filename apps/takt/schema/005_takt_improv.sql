-- Takt improv (2026-11-04): every take the improv agent reviewed, one row each: what was
-- played (the take as MIDI-like notes), what it was played over (the backing), and the review
-- (the notes and the one idea). See src/lib/takt/improv-agent.ts and apps/takt/IMPROV.md.
-- Apply: supabase db query --linked -f apps/takt/schema/005_takt_improv.sql

create table if not exists takt_improv (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references takt_users(id) on delete cascade,
  -- { tempo, ticksPerBeat, beatsPerBar, bars, notes: [{ t, n, v, len }] }
  take jsonb not null,
  -- { title, style, key, feel, form, scale, scaleName }
  backing jsonb not null,
  -- { where: level|jam, title, about, hand, device }
  context jsonb not null default '{}'::jsonb,
  -- { headline, notes: [..], idea: { title, why, bars, notes: [{ t, n, len, f }] } }
  review jsonb,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists takt_improv_user on takt_improv (user_id, created_at);

-- Only the server (service key) reads or writes these.
alter table takt_improv enable row level security;
