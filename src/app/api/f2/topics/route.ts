import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { listTopicsForUser } from '@/lib/f2/threads'

export const runtime = 'nodejs'

// Per-user, session-authed, live data — must never be cached by URLCache, a
// CDN, or any proxy. (Next's default `public, max-age=0, must-revalidate` is
// both wrong here and was being replayed stale by the iOS URLSession cache.)
const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  }

  const threads = await listTopicsForUser(user.id)
  const topics = threads.map((t) => ({
    id: t.id,
    topic: t.topic,
    url: t.url,
    last_quizzed_at: t.last_quizzed_at,
    quiz_count: t.quiz_count,
    stars: t.stars,
    hard_quiz_completed_at: t.hard_quiz_completed_at,
    pending_quiz_kind: t.pending_quiz_kind,
    kind: t.kind,
    created_at: t.created_at,
    updated_at: t.updated_at,
    client: t.client,
  }))
  return NextResponse.json({ topics }, { headers: NO_STORE })
}
