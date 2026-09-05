-- Publishing: a published track is playable by anyone at /t/<slug> and
-- listed in the catalog; anyone signed in can remix it (copy into their
-- library, remix_of pointing back).
--
-- Apply:  supabase db query --linked -f apps/jam/schema/002_jam_publish.sql

alter table jam_tracks
  add column if not exists published_at timestamptz,
  add column if not exists slug text,
  add column if not exists remix_of uuid references jam_tracks(id) on delete set null;

create unique index if not exists jam_tracks_slug on jam_tracks (slug) where slug is not null;
create index if not exists jam_tracks_published on jam_tracks (published_at desc) where published_at is not null;
