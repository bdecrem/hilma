import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getJumboState } from '@/lib/f2/flash'

export const runtime = 'nodejs'

// GET /api/f2/flash/jumbo — XP + the level map (derived from set history).
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const state = await getJumboState(user.id)
  return NextResponse.json(state)
}
