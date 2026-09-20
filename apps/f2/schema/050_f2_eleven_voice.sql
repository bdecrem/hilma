-- F2: the ElevenLabs voice engine (Speech Engine + Claude, src/lib/f2/eleven.ts).
-- Claude writes every spoken turn from a prompt that is fixed for the whole
-- session; /api/f2/eleven/turn reads it here on each turn. Null for GPT-Live
-- and Realtime sessions, whose prompts live with the provider.
alter table f2_voice_sessions
  add column if not exists system_prompt text;
