import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { dayView, ensureToday, resetToday } from '@/lib/dolly/day'

export const runtime = 'nodejs'

// POST /api/dolly/day/reset — start today over: the call, the things, the
// cards, the extra calls and the star round go back to the morning. Words
// already kept stay in the pool; the streak is not touched.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const day = await ensureToday(user)
  const fresh = await resetToday(day)
  return NextResponse.json({ day: await dayView(user, fresh) })
}
