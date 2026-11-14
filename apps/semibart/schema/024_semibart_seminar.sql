-- CASBS Quest: the seminar room as the last grab of the question mic left it (2026-11-14).
-- The chaos at the mic wrecks the room (paper everywhere, coffee, a smashed window, the trash can
-- kicked over, the screen down, the light hanging by a wire), and the mess stays for everyone until
-- the next visitor picks up the broom. Server code: src/lib/semibart/seminar.ts.
-- Apply: supabase db query --linked -f apps/semibart/schema/024_semibart_seminar.sql

create table if not exists semibart_seminar (
  id text primary key,                        -- 'room': the one everybody sees; 'check': the check account's own copy
  wreck jsonb,                                -- null when swept: { by, name, at, headline, moves: [{ act, who?, style? }] }
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

-- Only the server (service key) reads or writes it.
alter table semibart_seminar enable row level security;
