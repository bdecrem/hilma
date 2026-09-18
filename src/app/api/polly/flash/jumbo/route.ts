import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getJumboState } from '@/lib/polly/flash'

export const runtime = 'nodejs'

// GET /api/polly/flash/jumbo — XP + the level map (derived from set history).
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const state = await getJumboState(user.id)
  return NextResponse.json(state)
}
