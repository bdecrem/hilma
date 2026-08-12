-- Book Summary: one web-researched study-context summary per book topic,
-- generated on demand from the Topics ... menu (kind = 'book' only).
-- jsonb shape:
--   { status: 'generating' | 'ready' | 'error',
--     markdown, model, error, updated_at }
-- Null when never generated. The ready markdown is folded into the topic's
-- LLM context by buildFullContent, so chat, quizzes, flash decks, and voice
-- sessions all see it. Prompt: apps/feynd/BOOK-SUMMARY.md (runtime copy in
-- src/lib/f2/book-summary.ts).

alter table f2_threads add column if not exists book_summary jsonb;
