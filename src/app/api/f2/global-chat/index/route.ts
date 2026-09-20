import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { ensureUserIndexed } from '@/lib/f2/knowledge'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST /api/f2/global-chat/index — bring the signed-in user's knowledge index
// (digests + embedded chunks) up to date, for ~25 s per call. The client
// calls it while `pending` > 0 so opening the global chat after adding
// material catches up without waiting for the nightly pass.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const status = await ensureUserIndexed(user.id, { budgetMs: 25_000 })
  return NextResponse.json({ index: status })
}
