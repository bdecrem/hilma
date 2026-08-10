import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { f2Supabase } from '@/lib/f2/supabase'
import { awardFinalReviewStar, judgeFinalReview } from '@/lib/f2/flash'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/f2/topics/[id]/final-review — grade a finished Final Review
// voice session. An A grade awards star 3 + marks the topic mastered.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
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

  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const { data: session } = await f2Supabase()
    .from('f2_voice_sessions')
    .select('transcript, mode')
    .eq('id', body.voice_session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) {
    return NextResponse.json({ error: 'voice session not found' }, { status: 404 })
  }

  try {
    const grade = await judgeFinalReview(
      thread,
      (session.transcript ?? []) as { role?: string; text?: string }[],
    )
    let stars = thread.stars
    if (grade.passed && thread.stars < 3) {
      await awardFinalReviewStar(user.id, thread.id)
      stars = 3
    }
    return NextResponse.json({
      grade: grade.grade,
      passed: grade.passed,
      notes: grade.notes,
      strengths: grade.strengths,
      weaknesses: grade.weaknesses,
      stars,
      mastered: grade.passed,
    })
  } catch (e) {
    console.error('[f2/final-review] grading failed:', e)
    return NextResponse.json(
      { error: 'Grading failed — please try again.' },
      { status: 502 },
    )
  }
}
