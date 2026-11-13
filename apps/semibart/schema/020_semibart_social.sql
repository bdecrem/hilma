-- CASBS Quest social features (2026-11-12): the announcements that scroll along the bottom of
-- the screen, and what each fellow has asked their Claude to change about themselves.
-- Sticky notes are 002_semibart_notes.sql. Server code: src/lib/semibart/social.ts.
-- Apply: supabase db query --linked -f apps/semibart/schema/020_semibart_social.sql

-- One row per announcement ("Bart just added cute rats to his room"). The game polls for rows
-- newer than the last id it showed.
create table if not exists semibart_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('note', 'room', 'persona', 'system')),
  actor text not null default '',             -- the character who did it: 'bart'
  room text not null default '',              -- the room it happened in or to: 'mary', 'kevin'
  text text not null check (char_length(text) between 1 and 160),
  created_at timestamptz not null default now()
);
create index if not exists semibart_events_recent on semibart_events (created_at desc);

-- A fellow's own lines, where they differ from the ones the game ships with. data holds any of
-- { look, come, hello, lines: [..], doing }; a missing key means "as the game has it".
create table if not exists semibart_personas (
  character text primary key,                 -- the game's slug: 'mary'
  data jsonb not null default '{}'::jsonb,
  updated_by text not null default '',        -- the character who asked for it
  updated_at timestamptz not null default now()
);

-- Only the server (service key) reads or writes these.
alter table semibart_events enable row level security;
alter table semibart_personas enable row level security;
