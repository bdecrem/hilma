-- Polly: typed chats are chats (Direction 2b, docs/polly-infinity-2b.md; 2026-09-20).
--
-- A conversation can be spoken, typed, or both — one object either way. The
-- chat row now owns its transcript (typed turns land here as they happen;
-- a voice continuation is appended when the radio hangs up), and says how it
-- was had. A chat with no ended_at is still open: the text chat's "Finish &
-- clean up" closes it, and so does an hour of quiet (swept when chats are
-- listed). analyzed_turns is how much of the transcript the clean-up has
-- read, so continuing a cleaned-up chat only curates the new part.
-- Rows from before this migration keep transcript null and read their
-- voice session's transcript (src/lib/polly/infinity.ts: chatRows).

alter table polly_infinity_chats
  add column if not exists input text not null default 'voice'
    check (input in ('voice', 'text', 'mixed')),
  add column if not exists transcript jsonb,
  add column if not exists ended_at timestamptz,
  add column if not exists analyzed_turns int not null default 0;

update polly_infinity_chats set ended_at = created_at where ended_at is null;

create index if not exists polly_infinity_chats_open
  on polly_infinity_chats (updated_at) where ended_at is null;
