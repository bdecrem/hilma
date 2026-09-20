import { NextResponse, after } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { finishVoiceSession } from '@/lib/polly/realtime'
import { ensureCurrentLesson, talkStepFromSession } from '@/lib/polly/path'
import { appendChatTurns, chatForClient, finishChat, getInfinityChat } from '@/lib/polly/infinity'

export const runtime = 'nodejs'
// Finishing a lesson's last step writes the next lesson in after().
export const maxDuration = 300

type FinishBody = {
  transcript?: unknown
  summary?: string
  usage?: unknown
  /** The chat this session continued: its turns are appended to it. */
  continue_chat_id?: string
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: FinishBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id } = await ctx.params
  const ok = await finishVoiceSession({
    userId: user.id,
    voiceSessionId: id,
    transcript: body.transcript,
    summary: body.summary,
    usage: body.usage,
  })

  if (!ok) {
    return NextResponse.json({ error: 'update failed' }, { status: 500 })
  }
  // A voice session on a lesson Polly wrote is its Talk step, once the
  // learner really spoke; the step that finishes the lesson gets the next
  // one written.
  const talk = await talkStepFromSession({ userId: user.id, voiceSessionId: id })
  if (talk.finished) after(() => ensureCurrentLesson(user.id, user.username))

  // A continued chat: what was said joins the chat, which closes again (the
  // clean-up then reads only the new part).
  let chat = null
  if (body.continue_chat_id) {
    const target = await getInfinityChat(user.id, body.continue_chat_id)
    const rows = (Array.isArray(body.transcript) ? body.transcript : []) as { role?: string; text?: string }[]
    const turns = rows
      .filter((r) => r && typeof r.text === 'string' && r.text.trim())
      .map((r) => ({ role: r.role === 'assistant' ? 'assistant' as const : 'user' as const, text: r.text!.trim(), via: 'voice' as const }))
    if (target && turns.length > 0) await appendChatTurns(user.id, target, turns)
    if (target) chat = await finishChat(user.id, target.id)
  }
  return NextResponse.json({ ok: true, lesson_finished: talk.finished, chat: chat ? chatForClient(chat) : null })
}
