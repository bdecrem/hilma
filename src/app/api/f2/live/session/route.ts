import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { createVoiceSession, realtimeVoice } from '@/lib/f2/realtime'
import { resolveVoiceStart, type VoiceStartBody } from '@/lib/f2/voice-start'
import {
  buildBackendInstructions,
  buildLiveSessionConfig,
  createLiveWebRTCSession,
  liveBackendModel,
  liveModel,
  liveOpeningInstruction,
} from '@/lib/f2/live'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/f2/live/session — start a GPT-Live voice session for Dodo.
// The client sends its WebRTC SDP offer; we build the session (live prompt,
// backend prompt, voice) and exchange the offer with OpenAI on its behalf.
// The mode gates and scripts are shared with the ElevenLabs engine
// (resolveVoiceStart).
type SessionBody = VoiceStartBody & {
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

  // Pass the offer through untouched: SDP needs its final line ending.
  const sdp = typeof body.sdp === 'string' && body.sdp.trim() ? body.sdp : ''
  if (!sdp) {
    return NextResponse.json({ error: 'sdp offer required' }, { status: 400 })
  }

  const start = await resolveVoiceStart(user, body, 'gpt-live')
  if (!start.ok) {
    return NextResponse.json({ error: start.error }, { status: start.status })
  }
  const { mode, thread, cards, instructions, prefs } = start
  const voice = prefs.voice ?? realtimeVoice()

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
      // session.started arrives; null = Dodo waits for the user.
      opening_instruction: liveOpeningInstruction(mode, user.username),
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/live/session' })
}
