import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { getFlashCardsByIds } from '@/lib/f2/flash'
import {
  applyVoiceStyle,
  buildFinalReviewInstructions,
  buildFlashVoiceInstructions,
  buildRealtimeInstructions,
  createOpenAIRealtimeClientSecret,
  createVoiceSession,
  getVoicePrefs,
  realtimeModel,
  realtimeVoice,
  updateVoiceSessionRealtimeId,
  type RealtimeMode,
} from '@/lib/f2/realtime'

export const runtime = 'nodejs'
export const maxDuration = 30

type SessionBody = {
  mode?: RealtimeMode
  thread_id?: string
  // 'flash' mode: the selected deck (from /api/f2/flash/start), in order.
  card_ids?: string[]
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
  if (!['global', 'topic', 'flash', 'final_review'].includes(mode)) {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }

  let thread = null
  if (mode === 'topic' || mode === 'final_review' || (mode === 'flash' && body.thread_id)) {
    if (!body.thread_id) {
      return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
    }
    thread = await getThreadById(user.id, body.thread_id)
    if (!thread) {
      return NextResponse.json({ error: 'topic not found' }, { status: 404 })
    }
  }

  let instructions: string
  if (mode === 'flash') {
    const ids = body.card_ids ?? []
    if (ids.length === 0) {
      return NextResponse.json({ error: 'card_ids required' }, { status: 400 })
    }
    const cards = await getFlashCardsByIds(user.id, ids)
    const byId = new Map(cards.map((c) => [c.id, c]))
    const ordered = ids.map((id) => byId.get(id)).filter((c) => c != null)
    if (ordered.length !== ids.length) {
      return NextResponse.json({ error: 'unknown card in set' }, { status: 400 })
    }
    instructions = buildFlashVoiceInstructions({
      userName: user.username,
      topicLabel: thread ? (thread.topic ?? thread.url) : null,
      cards: ordered.map((c) => ({ question: c.question, answer: c.answer })),
    })
  } else if (mode === 'final_review') {
    // The client gates this behind stars 1+2; enforce server-side too.
    if ((thread?.stars ?? 0) < 2) {
      return NextResponse.json(
        { error: 'Final Review unlocks at 2 stars.' },
        { status: 403 },
      )
    }
    instructions = buildFinalReviewInstructions({ userName: user.username, thread: thread! })
  } else {
    instructions = buildRealtimeInstructions({
      mode,
      userName: user.username,
      thread,
    })
  }

  // Per-user voice + delivery style, account-wide across all voice surfaces.
  const prefs = await getVoicePrefs(user.id)
  const voice = prefs.voice ?? realtimeVoice()
  instructions = applyVoiceStyle(instructions, prefs.style)

  // Flash rounds are fully scripted — no tools. Everything else keeps the
  // topic-context tool.
  const openaiSecret = await createOpenAIRealtimeClientSecret({
    instructions,
    voice,
    ...(mode === 'flash' ? { tools: [] } : {}),
  })

  const voiceSession = await createVoiceSession({
    userId: user.id,
    mode,
    threadId: body.thread_id,
    realtimeSessionId: openaiSecret.session?.id,
    model: realtimeModel(),
    voice,
  })

  if (!voiceSession) {
    return NextResponse.json({ error: 'voice session create failed' }, { status: 500 })
  }

  if (openaiSecret.session?.id) {
    await updateVoiceSessionRealtimeId({
      userId: user.id,
      voiceSessionId: voiceSession.id,
      realtimeSessionId: openaiSecret.session.id,
    })
  }

  return NextResponse.json({
    client_secret: {
      value: openaiSecret.value,
      expires_at: openaiSecret.expires_at,
    },
    openai_session_id: openaiSecret.session?.id,
    voice_session: {
      id: voiceSession.id,
      mode,
      thread_id: body.thread_id ?? null,
    },
    realtime: {
      model: realtimeModel(),
      voice,
      calls_url: 'https://api.openai.com/v1/realtime/calls',
      data_channel: 'oai-events',
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/realtime/session' })
}
