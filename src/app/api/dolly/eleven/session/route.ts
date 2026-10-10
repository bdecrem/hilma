import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { openSession, startVoice } from '@/lib/dolly/eleven'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/dolly/eleven/session { mode: 'talk' | 'things', hold_to_talk }
// — start a voice session on the ElevenLabs engine: the prompt is stored on
// the session row (/api/dolly/eleven/turn reads it on every turn) and the
// phone gets a conversation token. Finishes through PATCH /api/dolly/voice/:id.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { mode?: string; hold_to_talk?: boolean }
  const mode = body.mode === 'things' ? 'things' : body.mode === 'talk' ? 'talk' : null
  if (!mode) return NextResponse.json({ error: 'mode must be talk or things' }, { status: 400 })
  const holdToTalk = body.hold_to_talk === true
  const start = await startVoice(user, mode, holdToTalk)
  if (!start.ok) return NextResponse.json({ error: start.error }, { status: start.status })
  try {
    return NextResponse.json(await openSession(user, start, holdToTalk))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'voice session failed'
    console.error('[dolly/eleven] session failed:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'dolly/eleven/session' })
}
