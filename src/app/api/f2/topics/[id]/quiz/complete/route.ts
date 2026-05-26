import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById, completeQuiz } from '@/lib/f2/threads'

export const runtime = 'nodejs'

// POST /api/f2/topics/[id]/quiz/complete
// Awards the star for the quiz kind currently marked pending on the thread,
// then clears the pending state. If no quiz was pending this is a safe no-op
// — protects against stale "Done" presses from awarding free stars.
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const recorded = await completeQuiz(thread)
  return NextResponse.json({
    stars: recorded.stars,
    quiz_count: recorded.quiz_count,
    hard_quiz_completed_at: recorded.hard_quiz_completed_at,
    pending_quiz_kind: null,
    completed_kind: thread.pending_quiz_kind,
  })
}
