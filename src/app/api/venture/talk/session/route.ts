import { createHmac } from 'node:crypto'
import { NextResponse } from 'next/server'
import { addTurn, isSession, keyOk, newSession, sessionTurns } from '@/lib/venture/interview'
import { mintTalkSecret, TALK } from '@/lib/venture/talk'

export const runtime = 'nodejs'
export const maxDuration = 30

// Local voice (OLA-529): the ears and the mouth are Kit's voice server on the Mac Studio, reached
// through its tunn3l address in KIT_VOICE_URL (https://kit-voice.tunn3l.sh). The browser gets a token good for six hours, signed with
// KIT_VOICE_SECRET (apps/venture/voice-local/server.py checks it); the secret never leaves here.
function localVoice(): { url: string; token: string } | null {
  const url = process.env.KIT_VOICE_URL?.trim()
  const secret = process.env.KIT_VOICE_SECRET?.trim()
  if (!url || !secret) return null
  const exp = String(Math.floor(Date.now() / 1000) + 6 * 3600)
  return { url, token: `${exp}.${createHmac('sha256', secret).update(`kit-voice:${exp}`).digest('hex')}` }
}

// POST /api/venture/talk/session  { key, session?, local? }
// Opens (or reopens) the open conversation: a Realtime client secret for the
// voice, and the session id its turns are stored under. A session that has
// turns and no "ended" marker continues; Claude reads its history from the
// database on every reply, so nothing has to be handed back here.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown; session?: unknown; local?: unknown } | null
  if (!body || !keyOk(body.key)) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let session: string = newSession()
  let resumed = false
  if (isSession(body.session)) {
    const turns = await sessionTurns(body.session)
    const ended = turns.some((t) => t.role === 'event' && t.text.startsWith('ended'))
    if (turns.some((t) => t.role !== 'event') && !ended) {
      session = body.session
      resumed = true
    }
  }

  if (body.local === true) {
    const voice = localVoice()
    if (!voice) return NextResponse.json({ error: 'local voice is not set up on this server' }, { status: 503 })
    await addTurn(session, 'event', resumed ? 'resumed' : 'started', TALK)
    await addTurn(session, 'event', 'voice: local (Mac Studio)', TALK)
    return NextResponse.json({ session, resumed, local: voice })
  }

  let secret
  try {
    secret = await mintTalkSecret()
  } catch (e) {
    console.error('[venture/talk] mint failed:', e)
    return NextResponse.json({ error: 'voice session unavailable' }, { status: 502 })
  }
  await addTurn(session, 'event', resumed ? 'resumed' : 'started', TALK)

  return NextResponse.json({
    session,
    resumed,
    client_secret: secret.value,
    model: secret.model,
    calls_url: 'https://api.openai.com/v1/realtime/calls',
  })
}
