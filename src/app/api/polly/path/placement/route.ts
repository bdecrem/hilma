import { NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getThreadById } from '@/lib/polly/threads'
import { ensureLessonDeck } from '@/lib/polly/flash'
import { placeLearner } from '@/lib/polly/path'

export const runtime = 'nodejs'
// One Opus call reads the conversation, plans the path and writes lesson 1
// (30–60 s); the lesson's two decks are built after the response.
export const maxDuration = 300

// POST /api/polly/path/placement — { voice_session_id }: the level check is
// over (its transcript is already saved by the session's finish call).
// Answers with the path — level, what they can do, what is shaky, the
// lessons — and the id of lesson 1, ready to open.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { voice_session_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.voice_session_id) {
    return NextResponse.json({ error: 'voice_session_id required' }, { status: 400 })
  }
  const result = await placeLearner({
    userId: user.id,
    userName: user.username,
    voiceSessionId: body.voice_session_id,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  after(async () => {
    const thread = await getThreadById(user.id, result.lesson_thread_id)
    if (thread) await ensureLessonDeck(thread)
  })
  return NextResponse.json({ path: result.view, lesson_thread_id: result.lesson_thread_id })
}
