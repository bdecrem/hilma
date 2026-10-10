import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { dayView, ensureToday } from '@/lib/dolly/day'
import { userView } from '@/lib/dolly/view'

export const runtime = 'nodejs'

// GET /api/dolly/today — today's day (created on first sight) and the map.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const day = await ensureToday(user)
  return NextResponse.json({ user: userView(user), day: await dayView(user, day) })
}
