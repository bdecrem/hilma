import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { dueCards } from '@/lib/f3/cards'

export const runtime = 'nodejs'

// GET /api/f3/review/queue?limit=12
// The cards due right now, most overdue first, with topic labels. The answer
// is included — the client needs it for the reveal/self-grade path, and it's
// the user's own data.
export async function GET(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const raw = Number(new URL(req.url).searchParams.get('limit'))
  const limit = Number.isFinite(raw) ? Math.max(1, Math.min(50, raw)) : 12
  const cards = await dueCards(user.id, limit)
  return NextResponse.json({ cards })
}
