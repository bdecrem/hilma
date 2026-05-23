import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import {
  buildRealtimeInstructions,
  createOpenAIRealtimeClientSecret,
  createVoiceSession,
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
  if (mode !== 'global' && mode !== 'topic') {
    return NextResponse.json({ error: 'invalid mode' }, { status: 400 })
  }

  let thread = null
  if (mode === 'topic') {
    if (!body.thread_id) {
      return NextResponse.json({ error: 'thread_id required' }, { status: 400 })
    }
    thread = await getThreadById(user.id, body.thread_id)
    if (!thread) {
      return NextResponse.json({ error: 'topic not found' }, { status: 404 })
    }
  }

  const instructions = buildRealtimeInstructions({
    mode,
    userName: user.username,
    thread,
  })

  const openaiSecret = await createOpenAIRealtimeClientSecret({ instructions })

  const voiceSession = await createVoiceSession({
    userId: user.id,
    mode,
    threadId: body.thread_id,
    realtimeSessionId: openaiSecret.session?.id,
    model: realtimeModel(),
    voice: realtimeVoice(),
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
      voice: realtimeVoice(),
      calls_url: 'https://api.openai.com/v1/realtime/calls',
      data_channel: 'oai-events',
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/realtime/session' })
}
