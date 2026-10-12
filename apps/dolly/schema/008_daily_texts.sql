-- Dolly: the daily text can be turned off (2026-10-12). Apply with
--   supabase db query --linked -f apps/dolly/schema/008_daily_texts.sql
-- Off = no daily text and no 8 pm reminder from the tick (dueFor returns
-- null); sign-in codes and the welcome still go. Settings → The daily text.
alter table dolly_users add column if not exists daily_texts boolean not null default true;
