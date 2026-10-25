import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

// The app's progress snapshot ({ lessons, skills }, ProgressStore.Snapshot), one per account.
// The app merges (furthest step, best tempo, the skill record with more attempts) before it
// PUTs, so the server just keeps the latest.

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
  const { error } = await f2Supabase()
    .from('takt_progress')
    .upsert({ user_id: user.id, snapshot: p, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: 'Could not save progress.' }, { status: 500 })
  await f2Supabase().from('takt_users').update({ last_seen_at: new Date().toISOString() }).eq('id', user.id)
  return NextResponse.json({ progress: p })
}
