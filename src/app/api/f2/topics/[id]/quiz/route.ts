import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById, recordQuizStarted, type QuizKind } from '@/lib/f2/threads'
import { processMessage } from '@/lib/f2/agent'

export const runtime = 'nodejs'

// POST /api/f2/topics/[id]/quiz
// Body (optional): { kind: 'standard' | 'hard' }
// Starts a quiz — sends the synthetic user nudge through the agent loop and
// marks `pending_quiz_kind` on the thread. The star is *not* awarded here;
// the user must POST /quiz/complete after they're done answering.
export async function POST(
  req: Request,
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

  let kind: QuizKind = 'standard'
  try {
    const body = (await req.json().catch(() => null)) as { kind?: string } | null
    if (body?.kind === 'hard') kind = 'hard'
  } catch {
    // empty/invalid body → default standard
  }

  const prompt =
    kind === 'hard'
      ? 'Give me the Hard Quiz on this topic — tougher questions, multi-step.'
      : 'Quiz me on this topic.'

  const result = await processMessage({
    userId: user.id,
    client: 'web',
    handle: user.username,
    text: prompt,
    threadId: id,
  })

  const recorded = await recordQuizStarted(thread, kind)

  return NextResponse.json({
    ...result,
    kind,
    pending_quiz_kind: kind,
    stars: recorded.stars,
    quiz_count: recorded.quiz_count,
    hard_quiz_completed_at: recorded.hard_quiz_completed_at,
  })
}
