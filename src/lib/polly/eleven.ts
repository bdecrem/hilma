// Polly voice on ElevenLabs Speech Engine + Claude — the second voice engine, a
// device-side setting next to GPT-Live (src/lib/polly/live.ts). Same shape as
// Dodo's (src/lib/f2/eleven.ts, docs/f2-eleven-voice-reference.md): ElevenLabs
// owns the audio, the voice bridge forwards each transcribed turn to
// /api/polly/eleven/turn, Claude answers as a text stream that is spoken.
//
// PHASE 1 (2026-09-20): conversation only — `topic` (lessons, guest lessons,
// the free Infinity chat, a chat continued out loud) and `global`. The level
// check, the clean-up walk, flash rounds and the spoken exams stay on GPT-Live
// until their scripts are tuned for a turn-based voice; the app's client
// factory sends those there whatever the setting says.
import { pollySupabase } from './supabase'
import { type RealtimeMode } from './realtime'

export const ELEVEN_MODES: RealtimeMode[] = ['topic', 'global']

export function pollyElevenEngineId(): string {
  const id = process.env.POLLY_ELEVEN_SPEECH_ENGINE_ID
  if (!id) throw new Error('POLLY_ELEVEN_SPEECH_ENGINE_ID is not set')
  return id
}

/// The opening rides inside the stored prompt: when the app's kickoff message
/// arrives as the first turn, this is what Claude is told to do with it.
export function withOpening(instructions: string, opening: string | null): string {
  if (!opening) return instructions
  return `${instructions}

OPENING: the first message you receive will be "(The session has just connected.)" — nobody has spoken yet. ${opening}`
}

export type PollyElevenSession = {
  id: string
  user_id: string
  mode: RealtimeMode
  system_prompt: string
  ended_at: string | null
}

export async function getPollyElevenSession(voiceSessionId: string): Promise<PollyElevenSession | null> {
  const { data, error } = await pollySupabase()
    .from('polly_voice_sessions')
    .select('id, user_id, mode, system_prompt, ended_at')
    .eq('id', voiceSessionId)
    .not('system_prompt', 'is', null)
    .maybeSingle()
  if (error) {
    console.error('[polly/eleven] getPollyElevenSession failed:', error)
    return null
  }
  return (data as PollyElevenSession | null) ?? null
}

export async function savePollyElevenPrompt(voiceSessionId: string, systemPrompt: string): Promise<boolean> {
  const { error } = await pollySupabase()
    .from('polly_voice_sessions')
    .update({ system_prompt: systemPrompt })
    .eq('id', voiceSessionId)
  if (error) console.error('[polly/eleven] savePollyElevenPrompt failed:', error)
  return !error
}

export async function setPollyElevenConversationId(voiceSessionId: string, conversationId: string) {
  const { error } = await pollySupabase()
    .from('polly_voice_sessions')
    .update({ realtime_session_id: conversationId })
    .eq('id', voiceSessionId)
    .is('realtime_session_id', null)
  if (error) console.error('[polly/eleven] setPollyElevenConversationId failed:', error)
}
