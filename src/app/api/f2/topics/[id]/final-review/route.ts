import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { f2Supabase } from '@/lib/f2/supabase'
import {
  applyRecertRenewal,
  awardFinalReviewStar,
  getSecondChanceState,
  judgeFinalReview,
  recertRenews,
  recordVoiceSessionGrade,
} from '@/lib/f2/flash'

export const runtime = 'nodejs'
// Opus 5 grades against the FULL source (a whole book can be ~250K tokens)
// plus a web-search verify pass — 60s was not enough once context got real.
export const maxDuration = 300

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
    const isSecondChance = session.mode === 'second_chance'
    const isRecert = session.mode === 'recert'

    // Recert grades on the retention bar and renews the badge clock —
    // stars are already 3 and never change here.
    if (isRecert) {
      const grade = await judgeFinalReview(
        thread,
        (session.transcript ?? []) as { role?: string; text?: string }[],
        'recert',
      )
      await recordVoiceSessionGrade(user.id, body.voice_session_id, grade)
      const renewed = recertRenews(grade.grade)
      let recert_due_at = thread.recert_due_at ?? null
      if (renewed) {
        recert_due_at = await applyRecertRenewal(user.id, thread.id, thread.recert_stage ?? 0)
      }
      return NextResponse.json({
        grade: grade.grade,
        notes: grade.notes,
        strengths: grade.strengths,
        weaknesses: grade.weaknesses,
        renewed,
        recert_due_at,
        stars: thread.stars,
        mastered: true,
        // Recert has no second-chance mechanic; the shape stays compatible
        // with FinalReviewResult decoding on the client.
        passed: renewed,
        second_chance: { eligible: false, until: null },
      })
    }

    const grade = await judgeFinalReview(
      thread,
      (session.transcript ?? []) as { role?: string; text?: string }[],
      isSecondChance ? 'second_chance' : 'full',
    )
    // Record the grade on the session row — full attempts become countable
    // history for Second Chance eligibility.
    await recordVoiceSessionGrade(user.id, body.voice_session_id, grade)

    let stars = thread.stars
    if (grade.passed && thread.stars < 3) {
      await awardFinalReviewStar(user.id, thread.id)
      stars = 3
    }

    // After a failed FULL attempt, tell the client whether the Second
    // Chance offer applies (2+ attempts, latest below A, 24h window).
    let second_chance: { eligible: boolean; until: string | null } = {
      eligible: false,
      until: null,
    }
    if (!grade.passed && !isSecondChance) {
      const sc = await getSecondChanceState(user.id, thread.id)
      second_chance = { eligible: sc.eligible, until: sc.until }
    }

    return NextResponse.json({
      grade: grade.grade,
      passed: grade.passed,
      notes: grade.notes,
      strengths: grade.strengths,
      weaknesses: grade.weaknesses,
      stars,
      mastered: grade.passed,
      second_chance,
    })
  } catch (e) {
    console.error('[f2/final-review] grading failed:', e)
    return NextResponse.json(
      { error: 'Grading failed — please try again.' },
      { status: 502 },
    )
  }
}
