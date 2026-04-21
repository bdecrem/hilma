-- Feynd Supabase schema — TWO tables.
--
--   feynd_chats     one row per conversation thread. Messages live inline
--                   in a jsonb array so we don't need a separate table.
--   feynd_quizzes   one row per (course, video). Cached MCQ questions plus
--                   a jsonb array of attempts (one element per submission,
--                   device_id inside the object).
--
-- All tables prefixed `feynd_` so they coexist cleanly with the other
-- projects in the shared vibeceo8 Supabase instance. RLS is DISABLED — the
-- Next.js backend is the single trusted writer (service key only) and
-- records are scoped by a per-device UUID sent via x-feynd-device.

-- ------------------------------------------------------------------ Chats
-- messages[] element shape:
--   { id, role: 'user'|'assistant', text, source, audio_url?, created_at }
create table if not exists feynd_chats (
  id         uuid primary key default gen_random_uuid(),
  device_id  text not null,
  course_id  text not null,
  video_id   text,                                -- nullable: open chats
  title      text not null,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_feynd_chats_device on feynd_chats(device_id, updated_at desc);
create index if not exists idx_feynd_chats_video  on feynd_chats(video_id);

-- --------------------------------------------------------------- Quizzes
-- questions[] element shape:
--   { id, q, options: [..4..], correct_idx, explanation, concept_ids?: [] }
-- attempts[] element shape:
--   { id, device_id, answers: [{question_id,user_idx,correct}], score, total, attempted_at }
create table if not exists feynd_quizzes (
  id           uuid primary key default gen_random_uuid(),
  course_id    text not null,
  video_id     text not null,
  questions    jsonb not null,
  attempts     jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  unique (course_id, video_id)
);

-- ------------------------------------------------------------- Storage
-- Create a public bucket `feynd-audio` for cached TTS mp3s via the
-- Supabase Dashboard → Storage → New bucket → name `feynd-audio` → public.
