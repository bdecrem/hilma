-- Mail on the company's domains (kochitolabs.com, clerkpdf.com, appadopt.com),
-- 2026-11-14. In: SendGrid Inbound Parse posts each message to
-- /api/kochito/mail/in (MX of each domain → mx.sendgrid.net). Out: sent through
-- SendGrid by scripts/venture/mail.mjs, which stores a row per message.
create table if not exists kochito_mail (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  direction text not null check (direction in ('in', 'out')),
  from_addr text not null,           -- the bare address, lower case
  from_name text,
  to_addr text not null,
  subject text not null default '',
  body text not null default '',     -- plain text
  html text,
  message_id text,
  in_reply_to text,
  meta jsonb,                        -- in: envelope, spam score, attachment count; out: SendGrid's id
  -- when the working session read an inbound message
  seen_at timestamptz
);
create index if not exists kochito_mail_unseen on kochito_mail (id) where direction = 'in' and seen_at is null;
create index if not exists kochito_mail_from on kochito_mail (from_addr);
alter table kochito_mail enable row level security;
