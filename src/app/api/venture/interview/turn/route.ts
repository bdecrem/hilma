import { NextResponse } from 'next/server'
import { addTurn, isSession, keyOk } from '@/lib/venture/interview'

export const runtime = 'nodejs'

// POST /api/venture/interview/turn  { key, session, role, text }
// One spoken turn (or an event marker) of the founding interview.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { key?: unknown; session?: unknown; role?: unknown; text?: unknown }
    | null
  if (!body || !keyOk(body.key)) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { session, role, text } = body
  if (!isSession(session)) return NextResponse.json({ error: 'bad session' }, { status: 400 })
  if (role !== 'claude' && role !== 'bart' && role !== 'event') {
    return NextResponse.json({ error: 'bad role' }, { status: 400 })
  }
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 })
  await addTurn(session, role, text.trim().slice(0, 20_000))
  return NextResponse.json({ ok: true })
}
