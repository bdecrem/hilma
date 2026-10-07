import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { declineActivelyRead, ensureTodaysPick } from '@/lib/f2/actively-read'

export const runtime = 'nodejs'

// GET /api/f2/actively-read — today's Actively Read pick (chosen now if the
// noon send hasn't chosen one yet): { pick: { day, thread_id, topic, resolved } | null }.
// The app's banner shows it while `resolved` is null.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  try {
    return NextResponse.json({ pick: await ensureTodaysPick(user.id) })
  } catch (e) {
    console.error('[f2] actively-read pick failed:', e)
    return NextResponse.json({ error: 'pick failed' }, { status: 500 })
  }
}

// POST /api/f2/actively-read { thread_id, action: 'decline' } — "Not
// interested" from the banner or the push action.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { thread_id?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (body.action !== 'decline' || !body.thread_id) {
    return NextResponse.json({ error: 'expected { thread_id, action: "decline" }' }, { status: 400 })
  }
  const ok = await declineActivelyRead(user.id, body.thread_id)
  if (!ok) return NextResponse.json({ error: 'topic not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
