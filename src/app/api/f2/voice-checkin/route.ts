import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { ensureTodaysCheckin, markTopicInactive } from '@/lib/f2/voice-checkin'

export const runtime = 'nodejs'
// Writing the question is one model call.
export const maxDuration = 60

// GET /api/f2/voice-checkin — today's Daily Voice Checkin (chosen now, with
// its question, if the 5 pm send hasn't chosen one yet):
// { checkin: { day, thread_id, topic, question, resolved } | null }.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    return NextResponse.json({ checkin: await ensureTodaysCheckin(user.id) })
  } catch (e) {
    console.error('[f2] voice-checkin pick failed:', e)
    return NextResponse.json({ error: 'pick failed' }, { status: 500 })
  }
}

// POST /api/f2/voice-checkin { thread_id, action: 'inactive' } — done with
// this topic: it becomes Inactive (the topic type) and leaves every daily pool.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { thread_id?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (body.action !== 'inactive' || !body.thread_id) {
    return NextResponse.json({ error: 'expected { thread_id, action: "inactive" }' }, { status: 400 })
  }
  const ok = await markTopicInactive(user.id, body.thread_id)
  if (!ok) return NextResponse.json({ error: 'topic not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
