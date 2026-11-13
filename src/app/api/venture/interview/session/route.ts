import { NextResponse } from 'next/server'
import {
  addTurn,
  interviewInstructions,
  isSession,
  keyOk,
  mintInterviewSecret,
  newSession,
  sessionTurns,
} from '@/lib/venture/interview'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/venture/interview/session  { key, session? }
// Mints a Realtime client secret for the founding interview. With a session
// id that has turns and no "ended" marker, the call resumes: the transcript
// so far goes into the brief and the interviewer picks up where it stopped.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { key?: unknown; session?: unknown } | null
  if (!body || !keyOk(body.key)) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let session: string = newSession()
  let prior: Awaited<ReturnType<typeof sessionTurns>> = []
  if (isSession(body.session)) {
    const turns = await sessionTurns(body.session)
    const ended = turns.some((t) => t.role === 'event' && t.text.startsWith('ended'))
    if (turns.length > 0 && !ended) {
      session = body.session
      prior = turns
    }
  }

  let secret
  try {
    secret = await mintInterviewSecret(interviewInstructions(prior))
  } catch (e) {
    console.error('[venture/interview] mint failed:', e)
    return NextResponse.json({ error: 'voice session unavailable' }, { status: 502 })
  }

  const resumed = prior.some((t) => t.role !== 'event')
  await addTurn(session, 'event', resumed ? 'resumed' : 'started')

  return NextResponse.json({
    session,
    resumed,
    client_secret: secret.value,
    model: secret.model,
    calls_url: 'https://api.openai.com/v1/realtime/calls',
  })
}
