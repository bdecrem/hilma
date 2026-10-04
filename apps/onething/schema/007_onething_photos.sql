-- Onething: a picture stuck to a day (2026-10-03).
--
-- One photo per day at most, like one sentence a day. It is marginalia, not
-- the entry: the sentence stays the entry, the photo is a small snapshot stuck
-- to the day's card (src/app/onething/Onething.tsx, Snapshot). The bytes live
-- in the public storage bucket `onething-photos` under <user id>/<day>-<ms>.jpg
-- (resized to 1600px on the long edge, JPEG, EXIF orientation applied —
-- src/lib/onething/photo.ts); `photo` is the public URL. A photo that arrives
-- over iMessage before the day's sentence waits in <user id>/pending/<day>.jpg
-- and is adopted when the sentence lands (recordEntry).
--
-- Links need no column: a URL inside the sentence is rendered as its domain.
--
-- Apply with: supabase db query --linked -f apps/onething/schema/007_onething_photos.sql
-- The bucket: scripts/onething/photo-check.ts creates it when it is missing
-- (public, images only, 12 MB cap).

alter table onething_entries add column if not exists photo text;
alter table onething_entries add column if not exists photo_w int;
alter table onething_entries add column if not exists photo_h int;
alter table onething_entries add column if not exists photo_at timestamptz;
