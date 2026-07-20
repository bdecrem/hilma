-- Audio Summary: one narrated recap per topic, generated on demand from the
-- Topics ... menu. jsonb shape:
--   { status: 'generating' | 'ready' | 'error',
--     url, script, scale: 'book' | 'short',
--     duration_secs, voice, error, updated_at }
-- Null when the topic has never had a summary generated. Audio files live in
-- the public f2-audio storage bucket at <user_id>/<thread_id>-<ts>.mp3.
alter table f2_threads add column if not exists audio_summary jsonb;
