-- Polly: the ElevenLabs voice engine (Speech Engine + Claude,
-- src/lib/polly/eleven.ts). Claude writes every spoken turn from a prompt that
-- is fixed for the whole session; /api/polly/eleven/turn reads it here on each
-- turn. Null for GPT-Live sessions, whose prompts live with the provider.
alter table polly_voice_sessions
  add column if not exists system_prompt text;
