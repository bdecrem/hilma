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
import { activeThings, insertVoiceSession, updateDay, type Day, type User, type VoiceMode, type VoiceSession } from './core'
import { comingBackItems, ensureToday, starTargets } from './day'
import { isTestPhone } from './send'
import {
  CALL_END_MS,
  CALL_WRAP_MS,
  holdToTalkNote,
  MORE_END_MS,
  MORE_WRAP_MS,
  moreOpening,
  morePrompt,
  moreWrapCue,
  STAR_END_MS,
  STAR_WRAP_MS,
  starOpening,
  starPrompt,
  starWrapCue,
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
  | {
      ok: true
      day: Day
      mode: VoiceMode
      systemPrompt: string
      cues: string[]
      wrap: { after_ms: number; end_ms: number; cue: string } | null
      /** The star round: what it practices, for the screen. */
      targets: { id: string; title: string }[]
    }

/** The gate and the prompt for a mode, against today's state. */
export async function startVoice(user: User, mode: VoiceMode, holdToTalk: boolean): Promise<VoiceStart> {
  const day = await ensureToday(user)
  const note = holdToTalk ? holdToTalkNote() : ''
  if (mode === 'talk') {
    if (day.state !== 'morning') return { ok: false, status: 409, error: 'Today’s call is done.' }
    const comingBack = await comingBackItems(user)
    const systemPrompt = withOpening(talkPrompt(user, day, comingBack), talkOpening(user, day)) + note
    return { ok: true, day, mode, systemPrompt, cues: [], wrap: { after_ms: CALL_WRAP_MS, end_ms: CALL_END_MS, cue: talkWrapCue() }, targets: [] }
  }
  if (mode === 'more') {
    if (day.state !== 'done') return { ok: false, status: 409, error: 'Finish today first.' }
    const comingBack = await comingBackItems(user)
    const systemPrompt = withOpening(morePrompt(user, day, comingBack), moreOpening(user)) + note
    return { ok: true, day, mode, systemPrompt, cues: [], wrap: { after_ms: MORE_WRAP_MS, end_ms: MORE_END_MS, cue: moreWrapCue() }, targets: [] }
  }
  if (mode === 'star') {
    if (!user.objectives) return { ok: false, status: 409, error: 'Turn on Learning objectives in Settings.' }
    if (day.state !== 'done') return { ok: false, status: 409, error: 'Finish today first.' }
    if (day.starred_at || day.star_state === 'done') return { ok: false, status: 409, error: 'Today is starred already.' }
    if (day.star_state) return { ok: false, status: 409, error: 'The star round is under way: the three things are next.' }
    const targets = await starTargets(user)
    if (targets.length === 0) return { ok: false, status: 409, error: 'Nothing left to practice at this level yet.' }
    const systemPrompt = withOpening(starPrompt(user, targets), starOpening(user, targets)) + note
    const withTargets = await updateDay(day.id, { star_targets: targets.map((t) => t.id) })
    return {
      ok: true,
      day: withTargets,
      mode,
      systemPrompt,
      cues: [],
      wrap: { after_ms: STAR_WRAP_MS, end_ms: STAR_END_MS, cue: starWrapCue() },
      targets: targets.map((t) => ({ id: t.id, title: t.title })),
    }
  }
  // things: the day's, or the star round's.
  const star = day.star_state === 'after_talk'
  if (!star && day.state !== 'after_talk') {
    return { ok: false, status: 409, error: day.state === 'morning' ? 'Talk first.' : 'The three things are done.' }
  }
  const things = activeThings(day)
  if (things.length === 0) return { ok: false, status: 409, error: 'No things to say back.' }
  const view = { ...day, things }
  const systemPrompt = withOpening(thingsPrompt(user, view), thingsOpening(view)) + note
  // The first thing rides in the opening; the app sends the rest, then the close.
  const cues = [...things.map((t, i) => thingCue(i, t)), thingsDoneCue()]
  return { ok: true, day, mode, systemPrompt, cues, wrap: null, targets: [] }
}

/** The response the app starts the conversation with — Polly's shape, so
 *  the ported client reads it unchanged. A test account that is not going
 *  to connect (`dry`) gets no real token: every minted token holds one of
 *  the workspace's concurrent-conversation slots until it expires, and the
 *  checks minting three per run hit ElevenLabs' concurrency cap on
 *  2026-10-10 — which would have failed Bart's own call. */
export async function openSession(user: User, start: Extract<VoiceStart, { ok: true }>, holdToTalk: boolean, dry = false) {
  if (dry && !isTestPhone(user.phone)) throw new Error('dry sessions are for test accounts')
  const token = dry ? 'dry-run-no-token' : await mintElevenConversationToken(dollyEngineId())
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
      // Calls: the wrap-up note at after_ms, and the app ends the call at end_ms.
      wrap: start.wrap,
      // The star round's objectives, for the screen.
      targets: start.targets,
    },
  }
}
