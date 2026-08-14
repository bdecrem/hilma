-- Echo ledger for outbound iMessages. In the same-Apple-ID daily-card chat,
-- the user's replies register as from-me — indistinguishable from our own
-- sends except by text. Every send is recorded here so the webhook can tell
-- "we just sent this" (echo, skip) from "the user typed this" (process).
create table if not exists f2_imessage_outbound (
  id         bigint generated always as identity primary key,
  chat_guid  text,
  text       text not null,
  sent_at    timestamptz not null default now()
);

alter table f2_imessage_outbound enable row level security;

create index if not exists f2_imessage_outbound_sent_idx
  on f2_imessage_outbound (sent_at desc);
