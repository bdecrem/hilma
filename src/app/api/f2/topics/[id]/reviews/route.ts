import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/f2/topics/[id]/reviews — every graded review attempt on this
// topic, newest first. Covers full Final Reviews plus their variants
// (Second Chance retakes, recert refreshers); quizzes may join later.
export async function GET(
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

  const { data, error } = await f2Supabase()
    .from('f2_voice_sessions')
    .select('id, mode, grade, graded_at, started_at, grade_detail')
    .eq('user_id', user.id)
    .eq('thread_id', id)
    .not('grade', 'is', null)
    .order('graded_at', { ascending: false })
  if (error) {
    console.error('[f2] reviews list failed:', error)
    return NextResponse.json({ error: 'lookup failed' }, { status: 500 })
  }

  type Detail = { notes?: string; strengths?: string[]; weaknesses?: string[] }
  const reviews = (data ?? []).map((r) => {
    const d = (r.grade_detail ?? {}) as Detail
    return {
      id: r.id,
      mode: r.mode,
      grade: r.grade,
      graded_at: r.graded_at ?? r.started_at,
      notes: d.notes ?? null,
      strengths: d.strengths ?? [],
      weaknesses: d.weaknesses ?? [],
    }
  })

  return NextResponse.json({ reviews }, { headers: NO_STORE })
}
