import { NextRequest, NextResponse } from 'next/server'
import { feyndAuth, feyndSupabase } from '@/lib/feynd/supabase'

export const runtime = 'nodejs'

// GET /api/feynd/chats?video_id=<optional>&course_id=<optional>
// Lists this device's chats (without the messages array — call /chats/:id
// for the full message thread).
export async function GET(request: NextRequest) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('video_id')
  const courseId = searchParams.get('course_id')

  const sb = feyndSupabase()
  let q = sb
    .from('feynd_chats')
    .select('id, device_id, course_id, video_id, title, created_at, updated_at')
    .eq('device_id', auth.deviceId)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (videoId) q = q.eq('video_id', videoId)
  if (courseId) q = q.eq('course_id', courseId)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chats: data })
}

// POST /api/feynd/chats
// Body: { course_id, video_id?, title? }
export async function POST(request: NextRequest) {
  const auth = feyndAuth(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { course_id?: string; video_id?: string | null; title?: string } = {}
  try { body = await request.json() } catch {}

  const courseId = (body.course_id ?? '').trim()
  if (!courseId) return NextResponse.json({ error: 'course_id required' }, { status: 400 })

  const sb = feyndSupabase()
  const { data, error } = await sb
    .from('feynd_chats')
    .insert({
      device_id: auth.deviceId,
      course_id: courseId,
      video_id: body.video_id ?? null,
      title: (body.title ?? 'New chat').slice(0, 200),
      messages: [],
    })
    .select('id, device_id, course_id, video_id, title, created_at, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chat: data })
}
