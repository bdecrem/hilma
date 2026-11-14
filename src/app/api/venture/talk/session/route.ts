import { NextResponse } from 'next/server'
import { addTurn, isSession, keyOk, newSession, sessionTurns } from '@/lib/venture/interview'
import { mintTalkSecret, TALK } from '@/lib/venture/talk'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/venture/talk/session  { key, session? }
// Opens (or reopens) the open conversation: a Realtime client secret for the
// voice, and the session id its turns are stored under. A session that has
// turns and no "ended" marker continues; Claude reads its history from the
// database on every reply, so nothing has to be handed back here.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown; session?: unknown } | null
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
