import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import {
  createOpenAIRealtimeClientSecret,
  createVoiceSession,
  realtimeModel,
  updateVoiceSessionRealtimeId,
} from '@/lib/f2/realtime'
import { buildWalkInstructions, walkAgenda, walkTools, walkVoice } from '@/lib/f4/walk'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/f4/walk/session
// Mint a Realtime session for a walk: compute the agenda, build Peri's
// instructions + tool catalog, get an ephemeral client secret from OpenAI,
// and open an f2_voice_sessions row (mode 'walk'). Response shape mirrors
// /api/f2/realtime/session so the WebRTC client code is interchangeable.
export async function POST() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const agenda = await walkAgenda(user.id)
  const instructions = buildWalkInstructions({ userName: user.username, agenda })

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

  const voiceSession = await createVoiceSession({
    userId: user.id,
    mode: 'walk',
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
      mode: 'walk',
      thread_id: null,
    },
    realtime: {
      model: realtimeModel(),
      voice: walkVoice(),
      calls_url: 'https://api.openai.com/v1/realtime/calls',
      data_channel: 'oai-events',
    },
    agenda: {
      due_count: agenda.due_count,
      card_count: agenda.card_count,
      streak_days: agenda.streak_days,
    },
  })
}
