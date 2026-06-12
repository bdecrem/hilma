import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { finishVoiceSession } from '@/lib/f2/realtime'
import { f2Supabase } from '@/lib/f2/supabase'
import { appendMessages, getThreadById, type F2ThreadMessage } from '@/lib/f2/threads'

export const runtime = 'nodejs'

type TranscriptTurn = { role?: unknown; text?: unknown; created_at?: unknown }

// PATCH /api/f4/walk/session/[id]
// Finish a voice session: persist transcript + summary, and — the bridge back
// to text mode — when the session was topic-scoped, append the spoken turns
// to that topic's chat thread so the conversation shows up in Discuss.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await ctx.params
  let body: { transcript?: unknown; summary?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }

  const transcript = Array.isArray(body.transcript) ? (body.transcript as TranscriptTurn[]) : []
  const summary = typeof body.summary === 'string' ? body.summary : undefined

  const ok = await finishVoiceSession({
    userId: user.id,
    voiceSessionId: id,
    transcript,
    summary,
  })
  if (!ok) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 })
  }

  // Bridge: topic-scoped sessions flow into the topic's chat history.
  let merged = 0
  if (transcript.length > 0) {
    const { data } = await f2Supabase()
      .from('f2_voice_sessions')
      .select('thread_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()
    const threadId = (data?.thread_id as string | null) ?? null
    if (threadId) {
      const thread = await getThreadById(user.id, threadId)
      if (thread) {
        const turns: F2ThreadMessage[] = transcript
          .filter((t): t is { role: string; text: string; created_at?: string } =>
            (t.role === 'user' || t.role === 'assistant') &&
            typeof t.text === 'string' && t.text.trim().length > 0,
          )
          .map((t) => ({
            role: t.role as 'user' | 'assistant',
            text: t.text.trim(),
            created_at:
              typeof t.created_at === 'string' ? t.created_at : new Date().toISOString(),
          }))
        if (turns.length > 0) {
          await appendMessages(threadId, user.id, thread.messages ?? [], turns)
          merged = turns.length
        }
      }
    }
  }

  return NextResponse.json({ ok: true, merged_into_chat: merged })
}
