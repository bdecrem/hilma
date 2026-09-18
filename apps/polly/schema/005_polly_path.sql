-- Polly: Agentic Learning Mode — the level check, the path, Polly's own lessons (2026-09-18).
--
-- A two-minute voice conversation (voice mode 'placement') finds the
-- learner's level; from its transcript Polly plans a short path of lessons
-- and writes the first one. Each lesson is a topic of its own kind,
-- 'lesson': a scene to talk through, about eight words, one grammar point.
-- Its plan lives in polly_threads.lesson (the same shape a guest lesson
-- uses, see src/lib/polly/lesson.ts), so cards, chat and voice already
-- know what to do with it. See src/lib/polly/path.ts.
--
--   polly_courses.level / placement   the level check's verdict
--   polly_courses.path                the planned lessons, in order:
--                                     [{ position, title, scene, grammar, thread_id }]
--                                     thread_id is null until that lesson is
--                                     written — which happens when the one
--                                     before it is finished.
--   polly_courses.path_card_dismissed_at   the Topics card, hidden by the user
--   polly_threads.path_position       1-based place on the path; null once a
--                                     retaken level check replaced the path
--   polly_threads.lesson_steps        { talk, words, grammar } → ISO time done
--   polly_threads.lesson_done_at      all three steps done
--   polly_flash_cards.lesson_step     'words' | 'grammar' on a lesson's cards

alter table polly_threads drop constraint if exists polly_threads_kind_check;
alter table polly_threads add constraint polly_threads_kind_check
  check (kind in ('chat', 'web', 'audio', 'video', 'paste', 'fallback', 'book', 'mini', 'general',
                  'guest_lesson', 'immersion', 'ask', 'lesson'));

alter table polly_threads
  add column if not exists path_position integer,
  add column if not exists lesson_steps jsonb not null default '{}'::jsonb,
  add column if not exists lesson_done_at timestamptz;

alter table polly_courses
  add column if not exists level text,
  add column if not exists placement jsonb,
  add column if not exists path jsonb not null default '[]'::jsonb,
  add column if not exists path_card_dismissed_at timestamptz;

alter table polly_flash_cards
  add column if not exists lesson_step text;
alter table polly_flash_cards drop constraint if exists polly_flash_cards_lesson_step_check;
alter table polly_flash_cards add constraint polly_flash_cards_lesson_step_check
  check (lesson_step is null or lesson_step in ('words', 'grammar'));

alter table polly_voice_sessions drop constraint if exists polly_voice_sessions_mode_check;
alter table polly_voice_sessions add constraint polly_voice_sessions_mode_check
  check (mode in ('global', 'topic', 'flash', 'final_review', 'second_chance', 'recert', 'placement'));
