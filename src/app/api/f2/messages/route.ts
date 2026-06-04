import { NextResponse } from 'next/server'
import { processMessage } from '@/lib/f2/agent'
import { getSessionUser } from '@/lib/f2/auth'

export const runtime = 'nodejs'
// "setup:" runs a synchronous search + rank + transcript-fetch loop that can
// take ~30-45s; give it room (the iMessage webhook already allows 60).
export const maxDuration = 60

// POST /api/f2/messages
// Web-app endpoint. Session-authenticated. Body: { text, thread_id? }.
// iMessage (and any future server-side client) calls processMessage directly,
// not this route — keeps the session contract clean.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { text?: string; thread_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  const result = await processMessage({
    userId: user.id,
    client: 'web',
    handle: user.username,
    text,
    threadId: body.thread_id,
  })
  return NextResponse.json(result)
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/messages' })
}
