// What a voice session needs before any provider is called: the mode checked
// against the user's state (stars, Second Chance window, deck) and the
// conversation prompt for it. Shared by both voice engines —
// /api/f2/live/session (GPT-Live) and /api/f2/eleven/session (ElevenLabs +
// Claude) — so the gates and scripts cannot drift apart.
import { getThreadById, type F2Thread } from './threads'
import { f2Supabase } from './supabase'
import { getFlashCardsByIds, getSecondChanceState, openFormQuestion } from './flash'
import { applyVoiceStyle, getVoicePrefs, type RealtimeMode, type VoicePrefs } from './realtime'
import { buildGlobalMapBlocks, buildGlobalSystem, getGlobalMessages } from './global-chat'
import {
  elevenPersona,
  buildLiveFinalReviewInstructions,
  buildLiveFlashInstructions,
  buildLiveRecertInstructions,
  buildLiveSecondChanceInstructions,
  buildLiveTalkInstructions,
  type VoiceEngine,
} from './live'

export const VOICE_MODES = ['global', 'topic', 'flash', 'final_review', 'second_chance', 'recert']

export type VoiceStartBody = {
  mode?: RealtimeMode
  thread_id?: string
  // 'flash' mode: the selected deck (from /api/f2/flash/start), in order.
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
      thread: F2Thread | null
      cards?: { question: string; answer: string }[]
      /** The conversation prompt with the user's delivery style applied. */
      instructions: string
      prefs: VoicePrefs
      /** Global mode: the full library map, for GPT-Live's backend prompt. */
      libraryMap?: string
    }

export async function resolveVoiceStart(
  user: { id: string; username: string },
  body: VoiceStartBody,
  engine: VoiceEngine,
): Promise<VoiceStart> {
  const mode = body.mode ?? 'global'
  if (!VOICE_MODES.includes(mode)) {
    return { ok: false, status: 400, error: 'invalid mode' }
  }

  let thread: F2Thread | null = null
  if (
    mode === 'topic' || mode === 'final_review' || mode === 'second_chance' ||
    mode === 'recert' ||
    (mode === 'flash' && body.thread_id)
  ) {
    if (!body.thread_id) {
      return { ok: false, status: 400, error: 'thread_id required' }
    }
    thread = await getThreadById(user.id, body.thread_id)
    if (!thread) {
      return { ok: false, status: 404, error: 'topic not found' }
    }
  }

  let instructions: string
  let libraryMap: string | undefined
  let cards: { question: string; answer: string }[] | undefined
  if (mode === 'flash') {
    const ids = body.card_ids ?? []
    if (ids.length === 0) {
      return { ok: false, status: 400, error: 'card_ids required' }
    }
    const rows = await getFlashCardsByIds(user.id, ids)
    const byId = new Map(rows.map((c) => [c.id, c]))
    const ordered = ids.map((id) => byId.get(id)).filter((c) => c != null)
    if (ordered.length !== ids.length) {
      return { ok: false, status: 400, error: 'unknown card in set' }
    }
    // Spoken rounds have no choices on screen — ask the standalone form.
    cards = ordered.map((c) => ({ question: openFormQuestion(c), answer: c.answer }))
    instructions = buildLiveFlashInstructions({
      userName: user.username,
      topicLabel: thread ? (thread.topic ?? thread.url) : null,
      cards,
      engine,
    })
  } else if (mode === 'final_review') {
    // The client gates this behind stars 1+2; enforce server-side too.
    if ((thread?.stars ?? 0) < 2) {
      return { ok: false, status: 403, error: 'Final Review unlocks at 2 stars.' }
    }
    instructions = buildLiveFinalReviewInstructions({ userName: user.username, thread: thread!, engine })
  } else if (mode === 'second_chance') {
    // Only within the 24h window after a failed 2nd+ Final Review attempt,
    // and never once the topic is mastered.
    if (thread!.hard_quiz_completed_at || thread!.stars >= 3) {
      return { ok: false, status: 403, error: 'Topic already mastered.' }
    }
    const sc = await getSecondChanceState(user.id, thread!.id)
    if (!sc.eligible) {
      return {
        ok: false,
        status: 403,
        error: 'No Second Chance available — take a Final Review first.',
      }
    }
    instructions = buildLiveSecondChanceInstructions({
      userName: user.username,
      thread: thread!,
      weaknesses: sc.last_weaknesses,
      engine,
    })
  } else if (mode === 'recert') {
    // Refreshers exist only for certified topics. Taking one early (before
    // the due date) is allowed — it just renews from today.
    if ((thread?.stars ?? 0) < 3) {
      return { ok: false, status: 403, error: 'Refreshers are for mastered topics.' }
    }
    // Seed with the most recent graded exam's flagged weaknesses.
    const { data: lastGraded } = await f2Supabase()
      .from('f2_voice_sessions')
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
      engine,
    })
  } else if (mode === 'topic') {
    instructions = buildLiveTalkInstructions({ mode: 'topic', userName: user.username, thread, engine })
  } else {
    // GLOBAL: the conversation across all of THIS user's topics. It is the
    // same conversation as the typed global chat, so what was said before
    // this call comes along.
    const recent = (await getGlobalMessages(user.id))
      .slice(-12)
      .map((m) => `${m.role === 'user' ? 'them' : 'you'}: ${m.text}`)
      .join('\n')
      .slice(-4000)
    if (engine === 'eleven') {
      // Claude carries the whole map and searches the material per turn
      // (runGlobalTurn in /api/f2/eleven/turn).
      const built = await buildGlobalSystem({
        userId: user.id,
        userName: user.username,
        surface: 'eleven',
        voicePersona: elevenPersona(user.username),
      })
      instructions = recent
        ? `${built.system}\n\nEARLIER IN THIS CONVERSATION (typed or spoken before this call):\n${recent}`
        : built.system
    } else {
      const blocks = await buildGlobalMapBlocks(user.id)
      libraryMap = blocks.full
      instructions = buildLiveTalkInstructions({
        mode: 'global',
        userName: user.username,
        engine,
        library: { compact: blocks.compact, topics: blocks.topics, recent },
      })
    }
  }

  // Per-user voice + delivery style, account-wide across all voice surfaces.
  const prefs = await getVoicePrefs(user.id)
  instructions = applyVoiceStyle(instructions, prefs.style)

  return { ok: true, mode, thread, cards, instructions, prefs, libraryMap }
}
