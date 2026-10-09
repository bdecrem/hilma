import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { f2Supabase } from '@/lib/f2/supabase'
import { judgeActivelyRead, type ActivelyReadGrade } from '@/lib/f2/flash'
import { awardActivelyRead, declineActivelyRead, type ActivelyReadReward } from '@/lib/f2/actively-read'

export const runtime = 'nodejs'
// Opus grades against the topic's full source.
export const maxDuration = 300

type GradeDetail = Omit<ActivelyReadGrade, 'grade' | 'passed'> & { passed: boolean; reward: ActivelyReadReward | null; not_interested: boolean }

// POST /api/f2/topics/[id]/actively-read { voice_session_id } — grade a
// finished Actively Read voice session. Tested at B+ or better: first star +
// the next Peck level. Declined in the conversation: out of the daily picks.
// Idempotent: a second call for the same session returns the first verdict.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { voice_session_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.voice_session_id) return NextResponse.json({ error: 'voice_session_id required' }, { status: 400 })

  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const sb = f2Supabase()
  const { data: session } = await sb
    .from('f2_voice_sessions')
    .select('transcript, mode, thread_id, grade, graded_at, grade_detail')
    .eq('id', body.voice_session_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'voice session not found' }, { status: 404 })
  if (session.mode !== 'actively_read' || session.thread_id !== thread.id) {
    return NextResponse.json({ error: 'not an Actively Read session for this topic' }, { status: 400 })
  }

  const respond = (grade: string | null, d: GradeDetail, stars: number) =>
    NextResponse.json({
      outcome: d.outcome,
      grade,
      passed: d.passed,
      questions_answered: d.questions_answered,
      notes: d.notes,
      strengths: d.strengths,
      weaknesses: d.weaknesses,
      stars,
      peck_level_cleared: d.reward?.peck_level ?? null,
      xp_awarded: d.reward?.xp_awarded ?? 0,
      not_interested: d.not_interested,
    })

  if (session.graded_at && session.grade_detail) {
    const fresh = await getThreadById(user.id, thread.id)
    return respond(session.grade as string | null, session.grade_detail as GradeDetail, fresh?.stars ?? thread.stars)
  }

  try {
    const g = await judgeActivelyRead(thread, (session.transcript ?? []) as { role?: string; text?: string }[])
    let reward: ActivelyReadReward | null = null
    let notInterested = false
    if (g.passed) reward = await awardActivelyRead(user.id, thread.id)
    else if (g.outcome === 'declined') notInterested = await declineActivelyRead(user.id, thread.id)

    const detail: GradeDetail = {
      outcome: g.outcome,
      questions_answered: g.questions_answered,
      notes: g.notes,
      strengths: g.strengths,
      weaknesses: g.weaknesses,
      passed: g.passed,
      reward,
      not_interested: notInterested,
    }
    const { error } = await sb
      .from('f2_voice_sessions')
      .update({ grade: g.grade, graded_at: new Date().toISOString(), grade_detail: detail })
      .eq('id', body.voice_session_id)
      .eq('user_id', user.id)
    if (error) console.error('[f2] actively-read grade record failed:', error)
    return respond(g.grade, detail, reward?.stars ?? thread.stars)
  } catch (e) {
    console.error('[f2] actively-read grading failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'grading failed' }, { status: 500 })
  }
}
