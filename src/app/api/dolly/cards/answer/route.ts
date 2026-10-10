import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { answerCard, dayView, ensureToday } from '@/lib/dolly/day'

export const runtime = 'nodejs'
// The last card completes the day, which picks tomorrow's topic.
export const maxDuration = 60

// POST /api/dolly/cards/answer { q, answer } — one card, graded here. Cards
// are answered in order; the day completes with the last one.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { q?: unknown; answer?: unknown }
  if (!Number.isInteger(body.q) || typeof body.answer !== 'string') {
    return NextResponse.json({ error: 'q and answer required' }, { status: 400 })
  }
  const day = await ensureToday(user)
  const result = await answerCard(user, day, body.q as number, body.answer)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  // The streak and tomorrow's topic changed on a complete: re-read the user.
  const fresh = result.complete ? (await getSessionUser()) ?? user : user
  return NextResponse.json({ ok: result.ok, target: result.target, complete: result.complete, day: await dayView(fresh, result.day) })
}
