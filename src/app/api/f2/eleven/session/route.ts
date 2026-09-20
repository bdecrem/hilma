import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { createVoiceSession } from '@/lib/f2/realtime'
import { resolveVoiceStart, type VoiceStartBody } from '@/lib/f2/voice-start'
import { holdToTalkNote } from '@/lib/f2/live'
import {
  ELEVEN_KICKOFF,
  elevenModel,
  elevenOpeningInstruction,
  mintElevenConversationToken,
  saveElevenSessionPrompt,
} from '@/lib/f2/eleven'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/f2/eleven/session — start a Dodo voice session on the ElevenLabs
// engine (Speech Engine + Claude). Same modes, gates and scripts as
// /api/f2/live/session. We store the conversation prompt on the voice-session
// row — /api/f2/eleven/turn reads it for every turn — and hand the phone a
// WebRTC conversation token. The session finishes through the same
// PATCH /api/f2/live/session/:id as GPT-Live.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: VoiceStartBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const start = await resolveVoiceStart(user, body, 'eleven')
  if (!start.ok) {
    return NextResponse.json({ error: start.error }, { status: start.status })
  }
  const { mode } = start
  const holdToTalk = body.hold_to_talk === true
  const systemPrompt = holdToTalk
    ? start.instructions + holdToTalkNote(user.username)
    : start.instructions

  let token: string
  try {
    token = await mintElevenConversationToken()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'eleven session failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const voiceSession = await createVoiceSession({
    userId: user.id,
    mode,
    threadId: body.thread_id,
    model: elevenModel(),
    voice: 'elevenlabs',
  })
  if (!voiceSession) {
    return NextResponse.json({ error: 'voice session create failed' }, { status: 500 })
  }
  const saved = await saveElevenSessionPrompt({ voiceSessionId: voiceSession.id, systemPrompt })
  if (!saved) {
    return NextResponse.json({ error: 'voice session create failed' }, { status: 500 })
  }

  return NextResponse.json({
    voice_session: {
      id: voiceSession.id,
      mode,
      thread_id: body.thread_id ?? null,
    },
    eleven: {
      conversation_token: token,
      model: elevenModel(),
      hold_to_talk: holdToTalk,
      // Passed by the client when it starts the conversation; the engine
      // forwards it to the bridge, which names the session on every turn.
      dynamic_variables: { dodo_voice_session: voiceSession.id },
      // Sent by the client as a text message once connected, so Dodo speaks
      // first; null = Dodo waits for the user.
      kickoff: elevenOpeningInstruction(mode) ? ELEVEN_KICKOFF : null,
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/eleven/session' })
}
