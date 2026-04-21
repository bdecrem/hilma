import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'

// POST /api/feynd/quiz-attempts
// Body: { course_id, video_id, quiz_id, answers: [{question_id, user_idx, correct}], score, total }
export async function POST(request: NextRequest) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  type Body = {
    course_id?: string
    video_id?: string
    quiz_id?: string
    answers?: unknown
    score?: number
    total?: number
  }
  let body: Body = {}
  try { body = await request.json() as Body } catch {}

  const courseId = body.course_id
  const videoId = body.video_id
  if (!courseId || !videoId) {
    return NextResponse.json({ error: 'course_id and video_id required' }, { status: 400 })
  }

  const sb = feyndSupabase()
  const { data, error } = await sb
    .from('feynd_quiz_attempts')
    .insert({
      device_id: auth.deviceId,
      course_id: courseId,
      video_id: videoId,
      quiz_id: body.quiz_id ?? null,
      answers: body.answers ?? [],
      score: typeof body.score === 'number' ? body.score : 0,
      total: typeof body.total === 'number' ? body.total : 0,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attempt: data })
}

// GET /api/feynd/quiz-attempts?video_id=<id> — this device's attempts
export async function GET(request: NextRequest) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('video_id')

  const sb = feyndSupabase()
  let q = sb
    .from('feynd_quiz_attempts')
    .select('*')
    .eq('device_id', auth.deviceId)
    .order('attempted_at', { ascending: false })
    .limit(50)
  if (videoId) q = q.eq('video_id', videoId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attempts: data })
}
