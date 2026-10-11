import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { listItems } from '@/lib/dolly/core'

export const runtime = 'nodejs'

// GET /api/dolly/items — every word, phrase and fix the learner has kept
// (the pool the cards draw from), newest first.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const items = (await listItems(user.id)).reverse().map((i) => ({
    id: i.id, kind: i.kind, target: i.target, native: i.native, pinyin: i.pinyin, source: i.source, day_n: i.day_n, hits: i.hits, misses: i.misses, last_seen: i.last_seen,
  }))
  return NextResponse.json({ items })
}
