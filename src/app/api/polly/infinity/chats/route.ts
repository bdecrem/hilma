import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { createInfinityChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'no-store' }

// POST /api/polly/infinity/chats { thread_id, voice_session_id } — record a
// finished free chat as a conversation (gives it a quick title).
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { thread_id?: string; voice_session_id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!body.thread_id || !body.voice_session_id) {
    return NextResponse.json({ error: 'thread_id and voice_session_id required' }, { status: 400 })
  }
  const chat = await createInfinityChat({
    userId: user.id,
    threadId: body.thread_id,
    voiceSessionId: body.voice_session_id,
  })
  return NextResponse.json({ chat })
}
