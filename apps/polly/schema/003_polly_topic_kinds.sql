-- Polly: three language-learning topic kinds (2026-09-18).
--
--   guest_lesson  a lesson made by someone else that Polly hosts: a podcast
--                 episode or video that already teaches (key words, a story
--                 as the hook, a check at the end). Lo Scandalo is one.
--   immersion     raw target-language material with no teaching attached:
--                 a book, a news story, a film, a show.
--   ask           "teach me about X" — no source, the tutor builds it.
--
-- Added to the check constraint next to Dodo's inherited kinds; nothing is
-- removed, existing rows are untouched. Attributes per kind come later.

alter table polly_threads drop constraint if exists polly_threads_kind_check;
alter table polly_threads add constraint polly_threads_kind_check
  check (kind in ('chat', 'web', 'audio', 'video', 'paste', 'fallback', 'book', 'mini', 'general',
                  'guest_lesson', 'immersion', 'ask'));
