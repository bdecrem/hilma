import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById, recordQuiz } from '@/lib/f2/threads'
import { processMessage } from '@/lib/f2/agent'

export const runtime = 'nodejs'

// POST /api/f2/topics/[id]/quiz
// Triggers a quiz on the given topic by sending a synthetic user message
// through the existing agent loop. The LLM's continue_chat behavior already
// knows how to quiz. Increments quiz_count on the thread.
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

  const result = await processMessage({
    userId: user.id,
    client: 'web',
    handle: user.username,
    text: 'Quiz me on this topic.',
    threadId: id,
  })

  await recordQuiz(thread.id, thread.quiz_count)

  return NextResponse.json(result)
}
