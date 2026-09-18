-- Polly: the lesson plan of a guest lesson (2026-09-18).
--
-- A guest_lesson topic (a podcast episode or video that already teaches)
-- gets its teacher's structure pulled out of the transcript once — host,
-- key words with meanings and their sentences from the story, a few extra
-- phrases, the story in brief, the host's closing question — and stored
-- here (see src/lib/polly/lesson.ts). Cards, chat, quizzes and voice read
-- it instead of inventing fact questions about the story's subject.
-- Null until extracted; null for every other kind.

alter table polly_threads add column if not exists lesson jsonb;
