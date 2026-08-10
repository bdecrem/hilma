-- F2: per-user voice preferences for Realtime voice sessions.
-- Applies account-wide (Dodo voice/flash/Final Review, Loci topic voice,
-- Peri walks): the session-mint routes read these and fall back to the
-- per-surface env defaults when null.
--   realtime_voice: OpenAI Realtime voice id (marin, cedar, ash, ...).
--   voice_style:    free-text delivery preferences folded into the session
--                   instructions (capped at 400 chars in app code).

alter table f2_users
  add column if not exists realtime_voice text,
  add column if not exists voice_style text;
