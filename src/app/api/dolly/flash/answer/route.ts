import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { findFlashSet } from '@/lib/dolly/core'
import { dayView, ensureToday } from '@/lib/dolly/day'
import { answerFlashCard, flashView } from '@/lib/dolly/flash'

export const runtime = 'nodejs'

// POST /api/dolly/flash/answer { id, q, answer } — one card of a set, graded
// here; the tenth finishes the set and pays its XP. The day comes back too
// (its xp view moved).
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; q?: unknown; answer?: unknown }
  if (typeof body.id !== 'string' || !Number.isInteger(body.q) || typeof body.answer !== 'string') {
    return NextResponse.json({ error: 'id, q and answer required' }, { status: 400 })
  }
  const set = await findFlashSet(user.id, body.id)
  if (!set) return NextResponse.json({ error: 'No such set.' }, { status: 404 })
  const result = await answerFlashCard(user, set, body.q as number, body.answer)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  const day = result.complete ? await dayView(user, await ensureToday(user)) : null
  return NextResponse.json({ ok: result.ok, target: result.target, complete: result.complete, set: await flashView(user, result.set), day })
}
