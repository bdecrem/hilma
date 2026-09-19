import { NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { ensureCurrentLesson, pathView, resetCourse, setPathCardDismissed } from '@/lib/polly/path'

export const runtime = 'nodejs'
// Opening the path can write the next lesson in after() (the retry when the
// write that a finished lesson kicked off did not land).
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/polly/path — the level check's verdict and the lessons in order
// (done / current / writing / locked), for the Topics card and path list.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  }
  const view = await pathView(user.id)
  if (view?.lessons.some((l) => l.state === 'writing')) {
    after(() => ensureCurrentLesson(user.id, user.username))
  }
  return NextResponse.json({ path: view }, { headers: NO_STORE })
}

// PATCH /api/polly/path — { dismissed: boolean } hides or restores the card
// on the Topics screen. The lessons themselves stay in the list.
export async function PATCH(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { dismissed?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.dismissed !== 'boolean') {
    return NextResponse.json({ error: 'dismissed required' }, { status: 400 })
  }
  if (!(await setPathCardDismissed(user.id, body.dismissed))) {
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }
  return NextResponse.json({ path: await pathView(user.id) })
}

// DELETE /api/polly/path — remove the path and drop back to unplaced, so the
// learner can build a new one from scratch. Finished lessons stay as topics.
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const view = await resetCourse(user.id)
  return NextResponse.json({ path: view })
}
