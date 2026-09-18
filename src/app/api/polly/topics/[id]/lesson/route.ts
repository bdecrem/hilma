import { NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getThreadById } from '@/lib/polly/threads'
import { ensureLesson } from '@/lib/polly/lesson'
import { ensureLessonDeck } from '@/lib/polly/flash'

// POST /api/polly/topics/[id]/lesson — make sure a guest lesson has its
// plan (extracting it now if it hasn't been yet) and return it. The app
// calls this when it opens a guest lesson whose plan is still null; every
// practice surface also ensures it on its own, so this only makes the card
// appear sooner. The lesson's deck is built right after, in the background. { lesson: null } for other kinds or a failed extraction.
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
  // The deck follows the plan, after the response — it's another slow call
  // and the card only needs the plan.
  if (ensured.lesson) after(() => ensureLessonDeck(ensured))
  return NextResponse.json({ lesson: ensured.lesson })
}
