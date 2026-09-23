-- Onething: the doodles are a setting (2026-09-23), on for everyone until
-- they turn it off. Off means no new drawing is made for a kept sentence
-- and the page hides the ones already drawn (the rows keep them, so turning
-- it back on shows them again).
--
-- Apply with: supabase db query --linked -f apps/onething/schema/006_onething_doodles_toggle.sql

alter table onething_users add column if not exists doodles boolean not null default true;
