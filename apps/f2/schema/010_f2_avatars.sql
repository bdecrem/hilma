-- F2: user avatars.
-- Adds a column on f2_users pointing at the uploaded image. The image itself
-- lives in a Supabase Storage bucket called `f2-avatars` (public-read, 1 MB
-- cap, jpg/png only). The bucket is created via the management API below.

alter table f2_users
  add column if not exists avatar_url text;

-- Bucket setup — idempotent. Public so the URL we hand back to clients works
-- without a signed-URL roundtrip. The 1 MB / allowed-mime-types enforcement
-- belongs on this bucket so we don't have to police it in app code.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'f2-avatars', 'f2-avatars', true, 1048576,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
