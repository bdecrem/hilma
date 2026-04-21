import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'

type Attempt = {
  id: string
  device_id: string
  answers: unknown
  score: number
  total: number
  attempted_at: string
}

// POST /api/feynd/quiz-attempts
// Body: { course_id, video_id, quiz_id?, answers, score, total }
// Appends the attempt to the quiz row's `attempts` jsonb array.
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

  const attempt: Attempt = {
    id: randomUUID(),
    device_id: auth.deviceId,
    answers: body.answers ?? [],
    score: typeof body.score === 'number' ? body.score : 0,
    total: typeof body.total === 'number' ? body.total : 0,
    attempted_at: new Date().toISOString(),
  }

  const sb = feyndSupabase()
  const { data: quiz, error: qErr } = await sb
    .from('feynd_quizzes')
    .select('id, attempts')
    .eq('course_id', courseId)
    .eq('video_id', videoId)
    .single()
  if (qErr || !quiz) {
    return NextResponse.json({ error: 'Quiz not found' }, { status: 404 })
  }

  const existing: Attempt[] = Array.isArray(quiz.attempts) ? (quiz.attempts as Attempt[]) : []
  const { error: upErr } = await sb
    .from('feynd_quizzes')
    .update({ attempts: [...existing, attempt] })
    .eq('id', quiz.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ attempt })
}

// GET /api/feynd/quiz-attempts?video_id=<id>&course_id=<id>
// Returns this device's attempts, most recent first.
export async function GET(request: NextRequest) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('video_id')
  const courseId = searchParams.get('course_id')

  const sb = feyndSupabase()
  let q = sb.from('feynd_quizzes').select('course_id, video_id, attempts')
  if (videoId) q = q.eq('video_id', videoId)
  if (courseId) q = q.eq('course_id', courseId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const attempts: Attempt[] = []
  for (const row of data ?? []) {
    const arr = Array.isArray(row.attempts) ? (row.attempts as Attempt[]) : []
    for (const a of arr) {
      if (a && a.device_id === auth.deviceId) attempts.push(a)
    }
  }
  attempts.sort((a, b) => (a.attempted_at < b.attempted_at ? 1 : -1))
  return NextResponse.json({ attempts: attempts.slice(0, 50) })
}
