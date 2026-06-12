import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import {
  createOpenAIRealtimeClientSecret,
  createVoiceSession,
  realtimeModel,
  updateVoiceSessionRealtimeId,
} from '@/lib/f2/realtime'
import { getThreadById } from '@/lib/f2/threads'
import { dueCards } from '@/lib/f3/cards'
import {
  buildTopicVoiceInstructions,
  buildWalkInstructions,
  walkAgenda,
  walkTools,
  walkVoice,
} from '@/lib/f4/walk'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/f4/walk/session
// Body (optional): { thread_id } — when present, mint a TOPIC-scoped voice
// session (the user hopped into voice from one topic in Loci); otherwise a
// global walk. Both use the Peri persona and the same tool catalog; response
// shape mirrors /api/f2/realtime/session so the WebRTC client code is shared.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let threadId: string | null = null
  try {
    const body = await req.json()
    if (body && typeof body.thread_id === 'string' && body.thread_id) {
      threadId = body.thread_id
    }
  } catch {
    // Empty body = global walk.
  }

  let instructions: string
  let agenda = { due_count: 0, card_count: 0, streak_days: 0 }
  if (threadId) {
    const thread = await getThreadById(user.id, threadId)
    if (!thread) {
      return NextResponse.json({ error: 'topic not found' }, { status: 404 })
    }
    const due = await dueCards(user.id, 20, new Date(), threadId)
    instructions = buildTopicVoiceInstructions({
      userName: user.username,
      thread,
      dueCount: due.length,
    })
    agenda.due_count = due.length
  } else {
    const walk = await walkAgenda(user.id)
    instructions = buildWalkInstructions({ userName: user.username, agenda: walk })
    agenda = {
      due_count: walk.due_count,
      card_count: walk.card_count,
      streak_days: walk.streak_days,
    }
  }

  let openaiSecret
  try {
    openaiSecret = await createOpenAIRealtimeClientSecret({
      instructions,
      tools: walkTools(),
      voice: walkVoice(),
    })
  } catch (e) {
    console.error('[f4/walk] client secret failed:', e)
    return NextResponse.json({ error: 'voice session unavailable' }, { status: 502 })
  }

  const mode = threadId ? 'topic' : 'walk'
  const voiceSession = await createVoiceSession({
    userId: user.id,
    mode,
    threadId: threadId ?? undefined,
    realtimeSessionId: openaiSecret.session?.id,
    model: realtimeModel(),
    voice: walkVoice(),
  })
  if (!voiceSession) {
    return NextResponse.json({ error: 'could not create session record' }, { status: 500 })
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
    openai_session_id: openaiSecret.session?.id ?? null,
    voice_session: {
      id: voiceSession.id,
      mode,
      thread_id: threadId,
    },
    realtime: {
      model: realtimeModel(),
      voice: walkVoice(),
      calls_url: 'https://api.openai.com/v1/realtime/calls',
      data_channel: 'oai-events',
    },
    agenda,
  })
}
