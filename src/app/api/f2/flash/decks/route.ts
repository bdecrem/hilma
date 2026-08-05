import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { listDecks } from '@/lib/f2/flash'

export const runtime = 'nodejs'

// GET /api/f2/flash/decks — every topic that has flash cards, with counts.
// Powers the Flash tab's deck manager (all decks in one place).
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  return NextResponse.json({ decks: await listDecks(user.id) })
}
