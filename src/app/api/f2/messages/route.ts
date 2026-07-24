import { NextResponse, after } from 'next/server'
import { processMessage } from '@/lib/f2/agent'
import { getSessionUser } from '@/lib/f2/auth'
import { isModelKey } from '@/lib/f2/llm'
import { getThreadById } from '@/lib/f2/threads'
import { generateAudioSummary, setAudioSummary } from '@/lib/f2/audio-summary'

export const runtime = 'nodejs'
// "setup:" / "new short|medium|long" / more_videos run a synchronous search +
// rank + transcript-fetch loop (~30-45s). The `summary` command additionally
// kicks off a book-scale map-reduce regeneration in after() (script + TTS +
// upload), which needs the same headroom as the audio-summary route.
export const maxDuration = 300

// POST /api/f2/messages
// Web-app + iOS endpoint. Session-authenticated. Body: { text, thread_id?,
// model? }. `model` is a registry key from lib/f2/llm.ts (the iOS/macOS
// picker); omitted → default model, unknown → 400 (fail loudly, no silent
// substitution). iMessage (and any future server-side client) calls
// processMessage directly, not this route — keeps the session contract clean.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { text?: string; thread_id?: string; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const text = body.text?.trim()
  if (!text) {
    return NextResponse.json({ error: 'text required' }, { status: 400 })
  }

  if (body.model !== undefined && !isModelKey(body.model)) {
    return NextResponse.json(
      { error: `unknown model: ${body.model}` },
      { status: 400 },
    )
  }

  const result = await processMessage({
    userId: user.id,
    client: 'web',
    handle: user.username,
    text,
    threadId: body.thread_id,
    model: body.model,
  })

  // The `summary <instructions>` command already marked the thread's
  // audio_summary as `generating`; run the heavy regeneration in the
  // background (script + TTS + upload can take minutes — well past this
  // route's maxDuration). The client polls /api/f2/topics for the flip to
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
        console.error('[f2] summary-command regeneration failed:', message)
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

  return NextResponse.json(result)
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'f2/messages' })
}
