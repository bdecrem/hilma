import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { findDayById, findVoiceSession, updateVoiceSession } from '@/lib/dolly/core'
import { dayView, finishTalk, finishThings } from '@/lib/dolly/day'
import { type TranscriptRow } from '@/lib/dolly/prompts'

export const runtime = 'nodejs'
// The talk's finish runs Claude over the transcript for the three things.
export const maxDuration = 60

// PATCH /api/dolly/voice/:id { transcript: [{role, text, created_at}], seconds }
// — the session ended: the transcript is kept and the day moves on (talk →
// three things picked; things → the cards written). Returns the day.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await ctx.params
  const session = await findVoiceSession(id)
  if (!session || session.user_id !== user.id) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const body = (await req.json().catch(() => ({}))) as { transcript?: unknown; seconds?: unknown }
  const rows = (Array.isArray(body.transcript) ? body.transcript : []) as { role?: unknown; text?: unknown }[]
  const transcript: TranscriptRow[] = rows
    .filter((r) => r && typeof r.role === 'string' && typeof r.text === 'string')
    .map((r) => ({ role: r.role as string, text: (r.text as string).slice(0, 2000) }))
  const seconds = Number.isFinite(body.seconds) ? Math.max(0, Math.round(body.seconds as number)) : null
  if (!session.ended_at) {
    await updateVoiceSession(session.id, { transcript, seconds, ended_at: new Date().toISOString() })
  }
  let day = session.day_id ? await findDayById(user.id, session.day_id) : null
  if (!day) return NextResponse.json({ error: 'day not found' }, { status: 404 })
  try {
    if (session.mode === 'talk') day = await finishTalk(user, day, session.id, transcript, seconds)
    else day = await finishThings(user, day, session.id)
  } catch (e) {
    console.error('[dolly] finish failed:', session.mode, e)
    return NextResponse.json({ error: 'Could not finish the session.' }, { status: 500 })
  }
  return NextResponse.json({ day: await dayView(user, day) })
}
