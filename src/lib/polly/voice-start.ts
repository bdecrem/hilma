// What a Polly voice session needs before any provider is called: the mode
// checked against the learner's state, and the conversation prompt for it
// (script, language, a conversation being continued, delivery style). Shared by
// both voice engines — /api/polly/live/session (GPT-Live) and
// /api/polly/eleven/session (ElevenLabs + Claude) — so gates and scripts
// cannot drift apart. Moved here from the live route on 2026-09-20.
import { getThreadById, type PollyThread } from './threads'
import { ensureLesson } from './lesson'
import { pollySupabase } from './supabase'
import { getFlashCardsByIds, getSecondChanceState, openFormQuestion } from './flash'
import { applyVoiceStyle, getVoicePrefs, type RealtimeMode, type VoicePrefs } from './realtime'
import {
  buildLiveCleanupInstructions,
  buildLiveFinalReviewInstructions,
  buildLiveFlashInstructions,
  buildLiveInfinityChatInstructions,
  buildLivePlacementInstructions,
  buildLiveRecertInstructions,
  buildLiveSecondChanceInstructions,
  buildLiveTalkInstructions,
  liveOpeningInstruction,
  toElevenInstructions,
} from './live'
import { activeLanguage, type LanguageCode } from './language'
import { chatRows, getInfinityChat, walkFixes } from './infinity'

export type VoiceEngine = 'gpt-live' | 'eleven'

export const VOICE_MODES = ['global', 'topic', 'flash', 'final_review', 'second_chance', 'recert', 'placement', 'cleanup']

export type VoiceStartBody = {
  mode?: RealtimeMode
  thread_id?: string
  // 'cleanup' mode: the Infinity Chat conversation being tidied up.
  chat_id?: string
  /** Continue this chat out loud (Direction 2b): a chat page's Continue, or
   *  the text chat's mic. Polly gets the conversation so far and picks it up. */
  continue_chat_id?: string
  // 'flash' mode: the selected deck (from /api/polly/flash/start), in order.
  card_ids?: string[]
  // Hold-to-talk (a device-side Voice setting): the mic is muted except
  // while the key is held. Folded into the prompt.
  hold_to_talk?: boolean
}

export type VoiceStart =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      mode: RealtimeMode
      thread: PollyThread | null
      cards?: { question: string; answer: string }[]
      /** The conversation prompt, delivery style applied. */
      instructions: string
      prefs: VoicePrefs
      language: LanguageCode | null
      /** What makes Polly speak first; null = she waits for the learner. */
      opening: string | null
    }

function fail(status: number, error: string): VoiceStart {
  return { ok: false, status, error }
}

export async function resolveVoiceStart(
  user: { id: string; username: string },
  body: VoiceStartBody,
  engine: VoiceEngine,
): Promise<VoiceStart> {
  const mode = body.mode ?? 'global'
  if (!VOICE_MODES.includes(mode)) {
    return fail(400, 'invalid mode')
  }
  let thread: PollyThread | null = null
  if (
    mode === 'topic' || mode === 'final_review' || mode === 'second_chance' ||
    mode === 'recert' ||
    (mode === 'flash' && body.thread_id)
  ) {
    if (!body.thread_id) {
      return fail(400, 'thread_id required')
    }
    thread = await getThreadById(user.id, body.thread_id)
    if (!thread) {
      return fail(404, 'topic not found')
    }
    thread = await ensureLesson(thread)
  }

  let instructions: string
  let cards: { question: string; answer: string }[] | undefined
  // Loaded after thread resolution for the infinity free-chat case.
  let language = mode === 'placement' || mode === 'cleanup' ? await activeLanguage(user.id) : null
  if (mode === 'cleanup') {
    // Clean-up walk over a curated Infinity Chat conversation.
    if (!body.chat_id) {
      return fail(400, 'chat_id required')
    }
    const chat = await getInfinityChat(user.id, body.chat_id)
    if (!chat) {
      return fail(404, 'conversation not found')
    }
    if (!chat.analysis) {
      return fail(409, 'Run clean-up first.')
    }
    instructions = buildLiveCleanupInstructions({
      userName: user.username,
      language,
      fixes: walkFixes(chat.analysis),
    })
  } else if (mode === 'placement') {
    // The level check: no topic, the learner's course language.
    if (!language) {
      return fail(409, 'Pick a language first.')
    }
    instructions = buildLivePlacementInstructions({ userName: user.username, language })
  } else if (mode === 'flash') {
    const ids = body.card_ids ?? []
    if (ids.length === 0) {
      return fail(400, 'card_ids required')
    }
    const rows = await getFlashCardsByIds(user.id, ids)
    const byId = new Map(rows.map((c) => [c.id, c]))
    const ordered = ids.map((id) => byId.get(id)).filter((c) => c != null)
    if (ordered.length !== ids.length) {
      return fail(400, 'unknown card in set')
    }
    // Spoken rounds have no choices on screen — ask the standalone form.
    cards = ordered.map((c) => ({ question: openFormQuestion(c), answer: c.answer }))
    instructions = buildLiveFlashInstructions({
      userName: user.username,
      topicLabel: thread ? (thread.topic ?? thread.url) : null,
      cards,
    })
  } else if (mode === 'final_review') {
    // The client gates this behind stars 1+2; enforce server-side too.
    if ((thread?.stars ?? 0) < 2) {
      return fail(403, 'Final Review unlocks at 2 stars.')
    }
    instructions = buildLiveFinalReviewInstructions({ userName: user.username, thread: thread! })
  } else if (mode === 'second_chance') {
    // Only within the 24h window after a failed 2nd+ Final Review attempt,
    // and never once the topic is mastered.
    if (thread!.hard_quiz_completed_at || thread!.stars >= 3) {
      return fail(403, 'Topic already mastered.')
    }
    const sc = await getSecondChanceState(user.id, thread!.id)
    if (!sc.eligible) {
      return fail(403, 'No Second Chance available — take a Final Review first.')
    }
    instructions = buildLiveSecondChanceInstructions({
      userName: user.username,
      thread: thread!,
      weaknesses: sc.last_weaknesses,
    })
  } else if (mode === 'recert') {
    // Refreshers exist only for certified topics. Taking one early (before
    // the due date) is allowed — it just renews from today.
    if ((thread?.stars ?? 0) < 3) {
      return fail(403, 'Refreshers are for mastered topics.')
    }
    // Seed with the most recent graded exam's flagged weaknesses.
    const { data: lastGraded } = await pollySupabase()
      .from('polly_voice_sessions')
      .select('grade_detail')
      .eq('user_id', user.id)
      .eq('thread_id', thread!.id)
      .not('grade', 'is', null)
      .order('graded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const weaknesses =
      ((lastGraded?.grade_detail as { weaknesses?: string[] } | null)?.weaknesses ?? [])
    instructions = buildLiveRecertInstructions({
      userName: user.username,
      thread: thread!,
      weaknesses,
    })
  } else if (mode === 'topic' && thread?.kind === 'infinity') {
    // Infinity Chat free conversation: just talk, no corrections.
    language = await activeLanguage(user.id)
    instructions = buildLiveInfinityChatInstructions({ userName: user.username, language })
  } else {
    instructions = buildLiveTalkInstructions({
      mode: mode === 'topic' ? 'topic' : 'global',
      userName: user.username,
      thread,
    })
  }

  // The ElevenLabs engine speaks through Claude: swap the persona and drop
  // the delegation policy before anything is appended to the script.
  if (engine === 'eleven') instructions = toElevenInstructions(instructions, user.username)

  let continuing = false
  if (body.continue_chat_id && mode === 'topic') {
    const chat = await getInfinityChat(user.id, body.continue_chat_id)
    if (!chat || chat.thread_id !== body.thread_id) {
      return fail(404, 'conversation not found')
    }
    const rows = (await chatRows(user.id, chat)).filter((t) => t.lane !== 'agent').slice(-40)
    if (rows.length > 0) {
      continuing = true
      instructions += `\n\nYOU ARE CONTINUING A CONVERSATION${chat.title ? ` ("${chat.title}")` : ''} the two of you already started${rows.some((t) => t.via === 'text') ? ' (some of it was typed)' : ''}. Do not greet them as if it were new and do not start over: pick it up where it stopped. The conversation so far:\n${rows.map((t) => `${t.role === 'assistant' ? 'Polly' : 'Learner'}: ${t.text}`).join('\n').slice(-6000)}`
    }
  }

  // Per-user voice + delivery style, account-wide across all voice surfaces.
  const prefs = await getVoicePrefs(user.id)
  instructions = applyVoiceStyle(instructions, prefs.style)

  const opening = continuing
    ? `Begin now, without waiting: in one short line, recall where the conversation stopped and ask one question that carries it on. Then listen.`
    : liveOpeningInstruction(mode, user.username, {
        language,
        pollyLesson: thread?.kind === 'lesson',
        infinity: thread?.kind === 'infinity',
      })

  return { ok: true, mode, thread, cards, instructions, prefs, language, opening }
}
