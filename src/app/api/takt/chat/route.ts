import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { parseChatRequest, runChat } from '@/lib/takt/chat-agent'
import { sseResponse } from '@/lib/takt/sse'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST /api/takt/chat { message, thread, context } — a question to the teacher from the app's
// Ask button, streamed: { type: 'status', text } while it thinks, { type: 'delta', text } as the
// words come, { type: 'reply', text, id } whole, then { type: 'done' }.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const parsed = parseChatRequest(await req.json().catch(() => null))
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 })
  return sseResponse(async (emit) => {
    await runChat(parsed, user.id, (e) => emit(e))
    emit({ type: 'done' })
  })
}
