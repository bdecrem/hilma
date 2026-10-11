import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { openSession, startVoice } from '@/lib/dolly/eleven'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/dolly/eleven/session { mode: talk | things | more | star | refresh, hold_to_talk, level? }
// — start a voice session on the ElevenLabs engine: the prompt is stored on
// the session row (/api/dolly/eleven/turn reads it on every turn) and the
// phone gets a conversation token. Finishes through PATCH /api/dolly/voice/:id.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { mode?: string; hold_to_talk?: boolean; dry?: boolean; level?: unknown }
  const mode = body.mode === 'things' || body.mode === 'talk' || body.mode === 'more' || body.mode === 'star' || body.mode === 'refresh' ? body.mode : null
  if (!mode) return NextResponse.json({ error: 'mode must be talk, things, more, star or refresh' }, { status: 400 })
  const holdToTalk = body.hold_to_talk === true
  const level = Number.isInteger(body.level) ? (body.level as number) : undefined
  const start = await startVoice(user, mode, holdToTalk, level)
  if (!start.ok) return NextResponse.json({ error: start.error }, { status: start.status })
  try {
    // `dry` (test accounts only): the session row without an ElevenLabs token.
    return NextResponse.json(await openSession(user, start, holdToTalk, body.dry === true))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'voice session failed'
    console.error('[dolly/eleven] session failed:', message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'dolly/eleven/session' })
}
