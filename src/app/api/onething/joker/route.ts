import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { COOKIE, findUserById, localDay, tzFor, verifySession } from '@/lib/onething/core'
import { JokerError, playJokers } from '@/lib/onething/jokers'

export const runtime = 'nodejs'

// POST { days } — play jokers on the missed days the page offered (jokers.ts).
// The offer is recomputed here; if it no longer covers exactly those days,
// nothing is spent and the page reloads what is true now.
export async function POST(req: Request) {
  const userId = verifySession((await cookies()).get(COOKIE)?.value)
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const user = await findUserById(userId)
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const body = (await req.json().catch(() => ({}))) as { days?: unknown }
  const days = Array.isArray(body.days) ? body.days.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) : []
  if (days.length === 0) return NextResponse.json({ error: 'Which days?' }, { status: 400 })
  try {
    const rescue = await playJokers(user, localDay(new Date(), tzFor(user)), days)
    return NextResponse.json({ ok: true, rescue })
  } catch (e) {
    if (e instanceof JokerError) return NextResponse.json({ error: e.message }, { status: 409 })
    throw e
  }
}
