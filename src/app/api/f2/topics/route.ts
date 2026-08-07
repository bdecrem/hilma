import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import {
  ALL_TOPIC_KINDS,
  createThread,
  listTopicsForUser,
  type TopicKind,
} from '@/lib/f2/threads'
import { audioSummaryForClient } from '@/lib/f2/audio-summary'

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
    pinned_at: t.pinned_at,
    study_focus: t.study_focus,
    // Script text stays out of list payloads — clients only need state + URL.
    audio_summary: audioSummaryForClient(t.audio_summary),
  }))
  return NextResponse.json({ topics }, { headers: NO_STORE })
}

// POST — create a bare topic from a typed title (the Topics screen's +
// button). No source material yet; chat and Add Material fill it in later.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { topic?: string; kind?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const topic = body.topic?.trim().slice(0, 200)
  if (!topic) {
    return NextResponse.json({ error: 'topic required' }, { status: 400 })
  }
  let kind: TopicKind | null = null
  if (body.kind !== undefined) {
    if (!ALL_TOPIC_KINDS.includes(body.kind as TopicKind)) {
      return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
    }
    kind = body.kind as TopicKind
  }

  const thread = await createThread({
    userId: user.id,
    client: 'web',
    handle: user.username,
    topic,
    kind,
  })
  if (!thread) {
    return NextResponse.json({ error: 'create failed' }, { status: 500 })
  }
  return NextResponse.json(
    { thread: { id: thread.id, topic: thread.topic, kind: thread.kind } },
    { headers: NO_STORE },
  )
}
