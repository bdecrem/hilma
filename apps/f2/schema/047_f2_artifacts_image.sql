-- F2: image pebbles. An artifact can now be a photo (kind = 'image') with an
-- optional caption in `body`. Storage object lives in the public `f2-pebbles`
-- bucket at <user_id>/<uuid>.jpg|png; `image_url` is its public URL.
alter table f2_artifacts add column if not exists image_url text;
-- Caption may be empty for photo pebbles; quotes still require text (enforced in code).
alter table f2_artifacts alter column body set default '';
