-- F2: idempotency table for webhook deduplication.
-- BlueBubbles can fire the same event twice (retries, queue replay, etc.).
-- Webhook handler INSERTs the guid before doing work; ON CONFLICT means dup.

create table if not exists f2_processed_webhooks (
  guid       text         primary key,
  client     text         not null,
  created_at timestamptz  not null default now()
);

create index if not exists f2_processed_webhooks_created_idx
  on f2_processed_webhooks (created_at desc);

alter table f2_processed_webhooks enable row level security;
