-- Minutes of every voice conversation and voice note (2026-11-17). Bart: "when we have voice mode
-- I need those conversations to go into your memory and decisions to be acted on, always." After a
-- call ends or a note is stored, one Claude call over the words writes them (src/lib/venture/minutes.ts):
-- what he decided (each with his confirming words), what is still to decide, what Kit will do,
-- facts worth remembering, and a two-line summary. Bart corrects them from the phone (a line moved
-- between decided and to decide, or removed); his corrections are marked "by": "bart".
-- The runner and transcript.mjs read the unseen ones. Service-key access only: RLS on, no policies.
create table if not exists venture_minutes (
  id bigint generated always as identity primary key,
  source text not null check (source in ('meeting', 'note')),
  ref text not null,                          -- meeting: venture_interview_turns.session; note: venture_messages.id
  at timestamptz not null default now(),
  summary text not null default '',
  decided jsonb not null default '[]',        -- [{ id, text, quote, by? }]
  to_decide jsonb not null default '[]',      -- [{ id, text, by? }]
  kit_will_do jsonb not null default '[]',    -- [{ id, text }]
  facts jsonb not null default '[]',          -- [{ id, text }]
  removed jsonb not null default '[]',        -- lines Bart deleted, kept so nothing is lost silently
  edited_at timestamptz,                      -- Bart's last correction
  seen_at timestamptz,                        -- when the runner or a session read them (null again after a correction)
  unique (source, ref)
);
create index if not exists venture_minutes_unseen on venture_minutes (id) where seen_at is null;
alter table venture_minutes enable row level security;
