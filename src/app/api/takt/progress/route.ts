import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

// The app's progress snapshot ({ lessons, skills }, ProgressStore.Snapshot), one per account.
// The app merges (furthest step, best tempo, the skill record with more attempts) before it
// PUTs, so the server just keeps the latest, with one exception: a lesson record set by hand
// (`setAt`, scripts/takt/set-lessons.ts) keeps its place in the module against a PUT whose copy
// is older or unstamped (an app build from before 0.1 (95) merges by max and drops the stamp).

type LessonRecord = { reachedStep?: number; lessonsDone?: number; completed?: string; setAt?: string }

function keepHandSet(incoming: Record<string, LessonRecord>, stored: Record<string, LessonRecord> | undefined) {
  for (const [code, s] of Object.entries(stored ?? {})) {
    if (!s.setAt) continue
    const r = incoming[code]
    if (r?.setAt && Date.parse(r.setAt) >= Date.parse(s.setAt)) continue
    const kept: LessonRecord = { ...r, reachedStep: s.reachedStep, lessonsDone: s.lessonsDone, setAt: s.setAt }
    if (s.completed) kept.completed = s.completed
    else delete kept.completed
    incoming[code] = kept
  }
}

// GET /api/takt/progress
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { data, error } = await f2Supabase()
    .from('takt_progress')
    .select('snapshot')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not read progress.' }, { status: 500 })
  return NextResponse.json({ progress: data?.snapshot ?? { lessons: {}, skills: {} } })
}

// PUT /api/takt/progress { progress }
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { progress?: { lessons?: unknown; skills?: unknown } } | null
  const p = body?.progress
  if (!p || typeof p.lessons !== 'object' || typeof p.skills !== 'object') {
    return NextResponse.json({ error: 'progress { lessons, skills } required' }, { status: 400 })
  }
  const { data: stored, error: readError } = await f2Supabase()
    .from('takt_progress')
    .select('snapshot')
    .eq('user_id', user.id)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: 'Could not read progress.' }, { status: 500 })
  keepHandSet(p.lessons as Record<string, LessonRecord>, stored?.snapshot?.lessons)
  const { error } = await f2Supabase()
    .from('takt_progress')
    .upsert({ user_id: user.id, snapshot: p, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: 'Could not save progress.' }, { status: 500 })
  await f2Supabase().from('takt_users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
  return NextResponse.json({ progress: p })
}
