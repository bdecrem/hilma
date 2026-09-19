-- Polly: content quality — the learner's Fast / Thorough setting (2026-09-19).
--
-- One account-level preference over every step that writes or judges
-- learning content (src/lib/polly/quality.ts: which model and effort each
-- feature runs at 'fast' and at 'deep'). On the user row, not the device, so
-- work that runs without a request — a deck built in after(), the next
-- lesson — honours it too. Each language profile (schema 007) carries a copy;
-- the profile route writes all of an account's rows at once.

alter table polly_users
  add column if not exists content_quality text not null default 'fast'
    check (content_quality in ('fast', 'deep'));
