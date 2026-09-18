import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getThreadById } from '@/lib/polly/threads'
import { ensureLesson } from '@/lib/polly/lesson'

// POST /api/polly/topics/[id]/lesson — make sure a guest lesson has its
// plan (extracting it now if it hasn't been yet) and return it. The app
// calls this when it opens a guest lesson whose plan is still null; every
// practice surface also ensures it on its own, so this only makes the card
// appear sooner. { lesson: null } for other kinds or a failed extraction.
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
  const ensured = await ensureLesson(thread)
  return NextResponse.json({ lesson: ensured.lesson })
}
