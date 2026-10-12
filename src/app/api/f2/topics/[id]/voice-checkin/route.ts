import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { f2Supabase } from '@/lib/f2/supabase'
import { judgeVoiceCheckin, type VoiceCheckinGrade } from '@/lib/f2/flash'
import { recordVoiceCheckin, type VoiceCheckinReward } from '@/lib/f2/voice-checkin'

export const runtime = 'nodejs'
// Opus grades against the topic's source.
export const maxDuration = 300

type GradeDetail = VoiceCheckinGrade & { question: string; reward: VoiceCheckinReward | null }

// POST /api/f2/topics/[id]/voice-checkin { voice_session_id } — grade a
// finished Daily Voice Checkin session. A pass (first or second attempt)
// settles the day as passed; a fail as failed; both count the attempt
// toward the daily streak. "Done with this topic" in the conversation makes
// it Inactive. Idempotent: a second call for the same session returns the
// first verdict.
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
  if (session.mode !== 'voice_checkin' || session.thread_id !== thread.id) {
    return NextResponse.json({ error: 'not a voice checkin session for this topic' }, { status: 400 })
  }

  const respond = (d: GradeDetail) =>
    NextResponse.json({
      outcome: d.outcome,
      passed: d.outcome === 'passed',
      passed_on: d.passed_on,
      attempts: d.attempts,
      notes: d.notes,
      question: d.question,
      counted: d.reward?.counted ?? false,
      streak: d.reward?.streak ?? 0,
      xp_awarded: d.reward?.xp_awarded ?? 0,
      inactive: d.outcome === 'inactive',
    })

  if (session.graded_at && session.grade_detail) {
    return respond(session.grade_detail as GradeDetail)
  }

  // The question this session asked: today's when it was today's topic.
  const { data: u } = await sb.from('f2_users').select('voice_checkin').eq('id', user.id).maybeSingle()
  const state = u?.voice_checkin as { thread_id?: string; question?: string } | null
  const transcript = (session.transcript ?? []) as { role?: string; text?: string }[]
  const question =
    state?.thread_id === thread.id && state.question
      ? state.question
      : transcript.find((t) => t.role !== 'user' && /\?/.test(t.text ?? ''))?.text?.match(/[^.?!]*\?/)?.[0]?.trim() ?? '(the question Dodo asked first)'

  try {
    const g = await judgeVoiceCheckin(thread, question, transcript)
    const reward = await recordVoiceCheckin(user.id, thread.id, g, body.voice_session_id)
    const detail: GradeDetail = { ...g, question, reward }
    const { error } = await sb
      .from('f2_voice_sessions')
      .update({ grade: g.outcome === 'passed' ? 'pass' : g.outcome === 'failed' ? 'fail' : null, graded_at: new Date().toISOString(), grade_detail: detail })
      .eq('id', body.voice_session_id)
      .eq('user_id', user.id)
    if (error) console.error('[f2] voice-checkin grade record failed:', error)
    return respond(detail)
  } catch (e) {
    console.error('[f2] voice-checkin grading failed:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'grading failed' }, { status: 500 })
  }
}
