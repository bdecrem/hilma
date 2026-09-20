import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { chatForClient, createInfinityChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'no-store' }

// POST /api/polly/infinity/chats { thread_id, voice_session_id | transcript } —
// record a finished conversation on a topic (gives it a quick title): a voice
// session, or a typed one handed over whole as [{ role, text }]. (The text
// chat itself stores its turns as they happen — see /api/polly/messages.)
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  let body: { thread_id?: string; voice_session_id?: string; transcript?: { role: string; text: string }[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const typed = Array.isArray(body.transcript) && body.transcript.some((t) => t?.role === 'user' && typeof t.text === 'string' && t.text.trim())
  if (!body.thread_id || (!body.voice_session_id && !typed)) {
    return NextResponse.json({ error: 'thread_id and voice_session_id (or a transcript) required' }, { status: 400 })
  }
  const chat = await createInfinityChat({
    userId: user.id,
    threadId: body.thread_id,
    voiceSessionId: body.voice_session_id,
    transcript: body.voice_session_id ? undefined : body.transcript,
  })
  return NextResponse.json({ chat: chatForClient(chat) })
}
