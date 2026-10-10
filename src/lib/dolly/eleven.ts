// Dolly's voice: ElevenLabs Speech Engine for the audio, Claude for the
// words, Polly's engine exactly (src/lib/f2/eleven.ts holds the shared
// parts: the token mint, the transcript → turns conversion, the streamed
// Claude turn). The bridge (apps/dodo-voice-bridge, /ws/dolly-prod and
// /ws/dolly-dev) POSTs every transcribed turn to /api/dolly/eleven/turn.
//
// GPT-Live is not wired: a session's `engine` column and the app's engine
// enum leave the slot, and a second session route would build the same
// prompt through startVoice() below.
import { ELEVEN_CUE_PREFIX, ELEVEN_KICKOFF, elevenModel, mintElevenConversationToken } from '@/lib/f2/eleven'
import { ensureToday } from './day'
import { insertVoiceSession, type Day, type User, type VoiceMode, type VoiceSession } from './core'
import { comingBackItems } from './day'
import {
  CALL_END_MS,
  CALL_WRAP_MS,
  holdToTalkNote,
  talkOpening,
  talkPrompt,
  talkWrapCue,
  thingCue,
  thingsDoneCue,
  thingsOpening,
  thingsPrompt,
} from './prompts'

export function dollyEngineId(): string {
  const id = process.env.DOLLY_ELEVEN_SPEECH_ENGINE_ID
  if (!id) throw new Error('DOLLY_ELEVEN_SPEECH_ENGINE_ID is not set')
  return id
}

export function withOpening(instructions: string, opening: string): string {
  return `${instructions}

OPENING: the first message you receive will be "(The session has just connected.)" — nobody has spoken yet. ${opening}`
}

export type VoiceStart =
  | { ok: false; status: number; error: string }
  | { ok: true; day: Day; mode: VoiceMode; systemPrompt: string; cues: string[]; wrap: { after_ms: number; end_ms: number; cue: string } | null }

/** The gate and the prompt for a mode, against today's state. */
export async function startVoice(user: User, mode: VoiceMode, holdToTalk: boolean): Promise<VoiceStart> {
  const day = await ensureToday(user)
  if (mode === 'talk') {
    if (day.state !== 'morning') return { ok: false, status: 409, error: 'Today’s call is done.' }
    const comingBack = await comingBackItems(user)
    let systemPrompt = withOpening(talkPrompt(user, day, comingBack), talkOpening(user, day))
    if (holdToTalk) systemPrompt += holdToTalkNote()
    return { ok: true, day, mode, systemPrompt, cues: [], wrap: { after_ms: CALL_WRAP_MS, end_ms: CALL_END_MS, cue: talkWrapCue() } }
  }
  if (day.state !== 'after_talk') {
    return { ok: false, status: 409, error: day.state === 'morning' ? 'Talk first.' : 'The three things are done.' }
  }
  if (!day.things || day.things.length === 0) return { ok: false, status: 409, error: 'No things to say back.' }
  let systemPrompt = withOpening(thingsPrompt(user, day), thingsOpening(day))
  if (holdToTalk) systemPrompt += holdToTalkNote()
  // The first thing rides in the opening; the app sends the rest, then the close.
  const cues = [...day.things.map((t, i) => thingCue(i, t)), thingsDoneCue()]
  return { ok: true, day, mode, systemPrompt, cues, wrap: null }
}

/** The response the app starts the conversation with — Polly's shape, so
 *  the ported client reads it unchanged. */
export async function openSession(user: User, start: Extract<VoiceStart, { ok: true }>, holdToTalk: boolean) {
  const token = await mintElevenConversationToken(dollyEngineId())
  const session: VoiceSession = await insertVoiceSession({
    user_id: user.id,
    day_id: start.day.id,
    mode: start.mode,
    system_prompt: start.systemPrompt,
  })
  return {
    voice_session: { id: session.id, mode: start.mode, day_id: start.day.id },
    eleven: {
      conversation_token: token,
      model: elevenModel(),
      hold_to_talk: holdToTalk,
      dynamic_variables: { dodo_voice_session: session.id },
      kickoff: ELEVEN_KICKOFF,
      cue_prefix: ELEVEN_CUE_PREFIX,
      silence_nudge: null,
      // Things: one cue per thing after the first (which is the opening),
      // then the close. The app sends cues[i] when thing i becomes current.
      cues: start.cues,
      // Talk: the wrap-up note at after_ms, and the app ends the call at end_ms.
      wrap: start.wrap,
    },
  }
}
