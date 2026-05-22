-- Generalize f2_threads to support multiple clients (sms, imessage, web, ios).
-- Renames `phone` → `handle`, adds `client` column. Existing rows backfilled as 'sms'.

alter table f2_threads rename column phone to handle;
alter table f2_threads add column if not exists client text not null default 'sms';

drop index if exists f2_threads_phone_updated_idx;
create index if not exists f2_threads_client_handle_updated_idx
  on f2_threads (client, handle, updated_at desc);
