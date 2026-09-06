-- Jam admins (2026-09-06): an admin can rename or delete any track in the
-- public catalog (PATCH / DELETE /api/jam/public/:slug). Bart is the only
-- admin for now; flip the column by hand to add one.
--
-- Apply:  supabase db query --linked -f apps/jam/schema/004_jam_admin.sql
-- Verify: ./scripts/db "select username, is_admin from jam_users where is_admin"

alter table jam_users add column if not exists is_admin boolean not null default false;

update jam_users set is_admin = true where username = 'bart';
