-- One iMessage inbox, three apps (2026-09-18).
--
-- BlueBubbles on the Mac mini posts every new message to one webhook; the
-- dispatcher (src/lib/imessage/dispatch.ts) decides whether it is for
-- Onething, Polly or Dodo. When a handle is paired to both Polly and Dodo
-- and the text carries no "polly"/"dodo" prefix, the conversation is
-- sticky: the app that handled this handle's last message keeps it for a
-- few hours. This table is that memory — one row per handle, overwritten
-- on every dispatch. Shared by both apps, so it lives with the F2 schema
-- (the F2 project is the one Supabase project both use).

create table if not exists imessage_routes (
  handle     text primary key,
  route      text not null check (route in ('onething', 'polly', 'dodo')),
  reason     text,
  routed_at  timestamptz not null default now()
);
alter table imessage_routes enable row level security;
