-- Takt mod versions (2026-11-02): every version of a mod that Agent mode saved, so a mod can
-- roll back to any earlier one. Version 0 is the clone as it was made (the original); each
-- turn that changes the song adds the next. A rollback is a new version with an old one's
-- content (the history stays linear, nothing is lost). See src/lib/takt/mods.ts.
-- Apply: supabase db query --linked -f apps/takt/schema/004_takt_mod_versions.sql

create table if not exists takt_mod_versions (
  id uuid primary key default gen_random_uuid(),
  mod_id uuid not null references takt_mods(id) on delete cascade,
  version int not null,
  title text not null,
  song jsonb not null,
  charting jsonb,
  -- What made this version: the player's ask, or "Back to v2".
  ask text not null default '',
  created_at timestamptz not null default now(),
  unique (mod_id, version)
);

alter table takt_mod_versions enable row level security;
