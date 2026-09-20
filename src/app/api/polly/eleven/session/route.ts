import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { createVoiceSession } from '@/lib/polly/realtime'
import { resolveVoiceStart, type VoiceStartBody } from '@/lib/polly/voice-start'
import { holdToTalkNote } from '@/lib/polly/live'
import { ELEVEN_KICKOFF, elevenModel, mintElevenConversationToken } from '@/lib/f2/eleven'
import { ELEVEN_MODES, pollyElevenEngineId, savePollyElevenPrompt, withOpening } from '@/lib/polly/eleven'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/polly/eleven/session — start a Polly voice session on the
// ElevenLabs engine (Speech Engine + Claude). Same gates and scripts as
// /api/polly/live/session. The prompt is stored on the voice-session row —
// /api/polly/eleven/turn reads it for every turn — and the phone gets a WebRTC
// conversation token. It finishes through the same
// PATCH /api/polly/live/session/:id as GPT-Live, so a continued chat still
// gets its turns appended.
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
  if (!ELEVEN_MODES.includes(body.mode ?? 'global')) {
    return NextResponse.json(
      { error: `The ElevenLabs engine does not run "${body.mode}" sessions yet.` },
      { status: 400 },
    )
  }

  const start = await resolveVoiceStart(user, body, 'eleven')
  if (!start.ok) {
    return NextResponse.json({ error: start.error }, { status: start.status })
  }
  const { mode } = start
  const holdToTalk = body.hold_to_talk === true
  let systemPrompt = withOpening(start.instructions, start.opening)
  if (holdToTalk) systemPrompt += holdToTalkNote(user.username)

  let token: string
  try {
    token = await mintElevenConversationToken(pollyElevenEngineId())
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
  if (!voiceSession || !(await savePollyElevenPrompt(voiceSession.id, systemPrompt))) {
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
      // Sent by the client as a text message once connected, so Polly speaks
      // first; null = she waits for the learner.
      kickoff: start.opening ? ELEVEN_KICKOFF : null,
    },
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'polly/eleven/session' })
}
