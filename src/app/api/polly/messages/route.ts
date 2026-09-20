import { NextResponse, after } from 'next/server'
import { processMessage, runWriteDocumentJob } from '@/lib/polly/agent'
import { getSessionUser } from '@/lib/polly/auth'
import { isModelKey } from '@/lib/polly/llm'
import { getThreadById } from '@/lib/polly/threads'
import { generateAudioSummary, setAudioSummary } from '@/lib/polly/audio-summary'
import { talkTurn, type TalkTurn } from '@/lib/polly/talk'

export const runtime = 'nodejs'
// "setup:" / "new short|medium|long" / more_videos run a synchronous search +
// rank + transcript-fetch loop (~30-45s). The `summary` command additionally
// kicks off a book-scale map-reduce regeneration in after() (script + TTS +
// upload), which needs the same headroom as the audio-summary route.
export const maxDuration = 300

// POST /api/polly/messages
// Web-app + iOS endpoint. Session-authenticated. Body: { text, thread_id?,
// model? }. `model` is a registry key from lib/polly/llm.ts (the iOS/macOS
// picker); omitted → default model, unknown → 400 (fail loudly, no silent
// substitution). iMessage (and any future server-side client) calls
// processMessage directly, not this route — keeps the session contract clean.
//
// `talk` marks a turn of the text chat (Direction 2b): { history, open? }.
// That thread has no modes — the server picks the lane (lib/polly/talk.ts)
// and answers { lane, intent, messages[], reply }. `talk.open` with no text
// asks Polly to speak first. Without `talk` this is the topic chat, unchanged.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: {
    text?: string; thread_id?: string; model?: string; new_topic?: boolean
    talk?: { history?: unknown; open?: boolean }
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = body.text?.trim()
  const opening = body.talk?.open === true && !text
  if (!text && !opening) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  if (body.model !== undefined && !isModelKey(body.model)) {
    return NextResponse.json(
      { error: `unknown model: ${body.model}` },
      { status: 400 },
    )
  }

  if (body.talk) {
    const history = parseHistory(body.talk.history)
    if (!history) {
      return NextResponse.json({ error: 'talk.history must be a list of { role, text }' }, { status: 400 })
    }
    try {
      const talk = await talkTurn({
        userId: user.id,
        userName: user.username,
        threadId: body.thread_id,
        history,
        text: text ?? null,
        model: body.model,
      })
      if (talk.write_document) {
        const { thread_id, title, brief } = talk.write_document
        const userId = user.id
        after(async () => {
          await runWriteDocumentJob(userId, thread_id, title, brief)
        })
      }
      const { write_document: _job, ...out } = talk
      return NextResponse.json({ ...out, reply: talk.messages.map((m) => m.text).join('\n\n') })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[polly/talk] turn failed:', message)
      return NextResponse.json(
        { error: message === 'topic not found' ? message : 'Polly tripped — try that again.' },
        { status: message === 'topic not found' ? 404 : 502 },
      )
    }
  }

  const result = await processMessage({
    userId: user.id,
    client: 'web',
    handle: user.username,
    text: text!,
    threadId: body.thread_id,
    model: body.model,
    newTopic: body.new_topic === true,
  })

  // The `summary <instructions>` command already marked the thread's
  // audio_summary as `generating`; run the heavy regeneration in the
  // background (script + TTS + upload can take minutes — well past this
  // route's maxDuration). The client polls /api/polly/topics for the flip to
  // ready, exactly like the Generate-Audio menu action.
  if (result.regenerate_summary) {
    const { thread_id, instructions, model } = result.regenerate_summary
    const userId = user.id
    after(async () => {
      try {
        const thread = await getThreadById(userId, thread_id)
        if (!thread) return
        await generateAudioSummary(thread, model, instructions)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[polly] summary-command regeneration failed:', message)
        const thread = await getThreadById(userId, thread_id)
        await setAudioSummary(thread_id, userId, {
          ...(thread?.audio_summary ?? {}),
          status: 'error',
          error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
      }
    })
  }

  // The dodo agent's write_document action: web search + long generation
  // run in the background; completion lands in the topic's chat.
  if (result.write_document) {
    const { thread_id, title, brief } = result.write_document
    const userId = user.id
    after(async () => {
      await runWriteDocumentJob(userId, thread_id, title, brief)
    })
  }

  return NextResponse.json(result)
}

/// The client's copy of the text chat: keep role, text and the lane (the
/// resume line needs to know which of Polly's turns were the conversation).
function parseHistory(raw: unknown): TalkTurn[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const out: TalkTurn[] = []
  for (const t of raw.slice(-80)) {
    const role = (t as TalkTurn)?.role
    const txt = (t as TalkTurn)?.text
    if ((role !== 'user' && role !== 'assistant') || typeof txt !== 'string') return null
    const lane = (t as TalkTurn).lane
    out.push({ role, text: txt.slice(0, 4000), ...(lane === 'agent' || lane === 'practice' ? { lane } : {}) })
  }
  return out
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'polly/messages' })
}
