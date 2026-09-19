import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getThreadById } from '@/lib/polly/threads'
import { ensureLesson } from '@/lib/polly/lesson'
import { pollySupabase } from '@/lib/polly/supabase'
import { getFlashCardsByIds, getSecondChanceState, openFormQuestion } from '@/lib/polly/flash'
import {
  applyVoiceStyle,
  createVoiceSession,
  getVoicePrefs,
  realtimeVoice,
  type RealtimeMode,
} from '@/lib/polly/realtime'
import {
  buildBackendInstructions,
  buildLiveCleanupInstructions,
  buildLiveFinalReviewInstructions,
  buildLiveFlashInstructions,
  buildLiveInfinityChatInstructions,
  buildLivePlacementInstructions,
  buildLiveRecertInstructions,
  buildLiveSecondChanceInstructions,
  buildLiveSessionConfig,
  buildLiveTalkInstructions,
  createLiveWebRTCSession,
  liveBackendModel,
  liveModel,
  liveOpeningInstruction,
  livePlacementNudge,
} from '@/lib/polly/live'
import { activeLanguage } from '@/lib/polly/language'
import { getInfinityChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/polly/live/session — start a GPT-Live voice session for Polly.
// The client sends its WebRTC SDP offer; we build the session (live prompt,
// backend prompt, voice) and exchange the offer with OpenAI on its behalf.
type SessionBody = {
  mode?: RealtimeMode
  thread_id?: string
  // 'cleanup' mode: the Infinity Chat conversation being tidied up.
  chat_id?: string
  // 'flash' mode: the selected deck (from /api/polly/flash/start), in order.
  card_ids?: string[]
  // Hold-to-talk (a device-side Voice setting): the mic is muted except
  // while the key is held. Folded into the live prompt.
  hold_to_talk?: boolean
  // The phone's WebRTC SDP offer.
  sdp?: string
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: SessionBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const mode = body.mode ?? 'global'
  if (!['global', 'topic', 'flash', 'final_review', 'second_chance', 'recert', 'placement', 'cleanup'].includes(mode)) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }
  // Pass the offer through untouched: SDP needs its final line ending.
  const sdp = typeof body.sdp === 'string' && body.sdp.trim() ? body.sdp : ''
  if (!sdp) {
    return NextResponse.json({ error: 'sdp offer required' }, { status: 400 })
  }

  let thread = null
  if (
    mode === 'topic' || mode === 'final_review' || mode === 'second_chance' ||
    mode === 'recert' ||
    (mode === 'flash' && body.thread_id)
  ) {
    if (!body.thread_id) {
      return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
    }
    thread = await getThreadById(user.id, body.thread_id)
    if (!thread) {
      return NextResponse.json({ error: 'topic not found' }, { status: 404 })
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
      return NextResponse.json({ error: 'chat_id required' }, { status: 400 })
    }
    const chat = await getInfinityChat(user.id, body.chat_id)
    if (!chat) {
      return NextResponse.json({ error: 'conversation not found' }, { status: 404 })
    }
    if (!chat.analysis) {
      return NextResponse.json({ error: 'Run clean-up first.' }, { status: 409 })
    }
    instructions = buildLiveCleanupInstructions({
      userName: user.username,
      language,
      fixes: chat.analysis.fixes,
    })
  } else if (mode === 'placement') {
    // The level check: no topic, the learner's course language.
    if (!language) {
      return NextResponse.json({ error: 'Pick a language first.' }, { status: 409 })
    }
    instructions = buildLivePlacementInstructions({ userName: user.username, language })
  } else if (mode === 'flash') {
    const ids = body.card_ids ?? []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'card_ids required' }, { status: 400 })
    }
    const rows = await getFlashCardsByIds(user.id, ids)
    const byId = new Map(rows.map((c) => [c.id, c]))
    const ordered = ids.map((id) => byId.get(id)).filter((c) => c != null)
    if (ordered.length !== ids.length) {
      return NextResponse.json({ error: 'unknown card in set' }, { status: 400 })
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
      return NextResponse.json(
        { error: 'Final Review unlocks at 2 stars.' },
        { status: 403 },
      )
    }
    instructions = buildLiveFinalReviewInstructions({ userName: user.username, thread: thread! })
  } else if (mode === 'second_chance') {
    // Only within the 24h window after a failed 2nd+ Final Review attempt,
    // and never once the topic is mastered.
    if (thread!.hard_quiz_completed_at || thread!.stars >= 3) {
      return NextResponse.json({ error: 'Topic already mastered.' }, { status: 403 })
    }
    const sc = await getSecondChanceState(user.id, thread!.id)
    if (!sc.eligible) {
      return NextResponse.json(
        { error: 'No Second Chance available — take a Final Review first.' },
        { status: 403 },
      )
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
      return NextResponse.json(
        { error: 'Refreshers are for mastered topics.' },
        { status: 403 },
      )
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

  // Per-user voice + delivery style, account-wide across all voice surfaces.
  const prefs = await getVoicePrefs(user.id)
  const voice = prefs.voice ?? realtimeVoice()
  instructions = applyVoiceStyle(instructions, prefs.style)

  const holdToTalk = body.hold_to_talk === true
  const session = buildLiveSessionConfig({
    instructions,
    backendInstructions: buildBackendInstructions({
      mode,
      userName: user.username,
      thread,
      cards,
    }),
    voice,
    holdToTalk,
    userName: user.username,
  })

  let live: { sessionId: string; answerSdp: string }
  try {
    live = await createLiveWebRTCSession({ session, sdp })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'live session failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const voiceSession = await createVoiceSession({
    userId: user.id,
    mode,
    threadId: body.thread_id,
    realtimeSessionId: live.sessionId,
    model: liveModel(),
    voice,
  })

  if (!voiceSession) {
    return NextResponse.json({ error: 'voice session create failed' }, { status: 500 })
  }

  return NextResponse.json({
    voice_session: {
      id: voiceSession.id,
      mode,
      thread_id: body.thread_id ?? null,
    },
    live: {
      session_id: live.sessionId,
      model: liveModel(),
      backend_model: liveBackendModel(),
      voice,
      hold_to_talk: holdToTalk,
      sdp_answer: live.answerSdp,
      data_channel: 'oai-events',
      // Sent by the client as session.instructions.append once
      // session.started arrives; null = Polly waits for the user.
      opening_instruction: liveOpeningInstruction(mode, user.username, {
        language,
        pollyLesson: thread?.kind === 'lesson',
        infinity: thread?.kind === 'infinity',
      }),
      // The level check only: what to append when the learner says nothing
      // for `after_ms` after Polly's greeting. Null elsewhere.
      silence_nudge: mode === 'placement' && language ? livePlacementNudge(user.username, language) : null,
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'polly/live/session' })
}
