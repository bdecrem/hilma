import { NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { finishVoiceSession } from '@/lib/polly/realtime'
import { ensureCurrentLesson, talkStepFromSession } from '@/lib/polly/path'

export const runtime = 'nodejs'
// Finishing a lesson's last step writes the next lesson in after().
export const maxDuration = 300

type FinishBody = {
  transcript?: unknown
  summary?: string
  usage?: unknown
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: FinishBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id } = await ctx.params
  const ok = await finishVoiceSession({
    userId: user.id,
    voiceSessionId: id,
    transcript: body.transcript,
    summary: body.summary,
    usage: body.usage,
  })

  if (!ok) {
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }
  // A voice session on a lesson Polly wrote is its Talk step, once the
  // learner really spoke; the step that finishes the lesson gets the next
  // one written.
  const talk = await talkStepFromSession({ userId: user.id, voiceSessionId: id })
  if (talk.finished) after(() => ensureCurrentLesson(user.id, user.username))
  return NextResponse.json({ ok: true, lesson_finished: talk.finished })
}
