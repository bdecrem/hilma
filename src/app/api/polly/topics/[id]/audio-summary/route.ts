import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { getThreadById } from '@/lib/polly/threads'
import { isModelKey } from '@/lib/polly/llm'
import {
  audioSummaryForClient,
  generateAudioSummary,
  setAudioSummary,
  type AudioSummary,
} from '@/lib/polly/audio-summary'

export const runtime = 'nodejs'
// Script generation (book scale can be ~2,800 words from Opus) plus chunked
// TTS plus the upload all run inside after() — give the function real room.
export const maxDuration = 300

// A 'generating' row older than this is considered dead (function timed out
// or crashed before it could mark the error) and may be retried.
const STALE_GENERATING_MS = 6 * 60 * 1000

// POST /api/polly/topics/[id]/audio-summary
// Body (optional): { model?: string } — registry key from lib/polly/llm.ts, the
// same active-model key the client sends for chat. Returns 202 immediately
// with { audio_summary: { status: 'generating', ... } }; the work continues
// via after(). Clients poll /api/polly/topics until status flips to ready/error.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  let model: string | undefined
  const body = (await req.json().catch(() => null)) as { model?: string } | null
  if (body?.model !== undefined) {
    if (!isModelKey(body.model)) {
      return NextResponse.json(
        { error: `unknown model: ${body.model}` },
        { status: 400 },
      )
    }
    model = body.model
  }

  // Don't double-spend on a generation that's already in flight.
  const existing = (thread as { audio_summary?: AudioSummary | null }).audio_summary
  if (existing?.status === 'generating') {
    const startedAt = Date.parse(existing.updated_at ?? '') || 0
    if (Date.now() - startedAt < STALE_GENERATING_MS) {
      return NextResponse.json(
        { error: 'already generating', audio_summary: audioSummaryForClient(existing) },
        { status: 409 },
      )
    }
  }

  // Preserve any prior transcript/version history while regenerating, so a
  // failure (or the in-flight window) never drops the base + augmented set.
  const pending: AudioSummary = {
    ...(existing ?? {}),
    status: 'generating',
    updated_at: new Date().toISOString(),
  }
  await setAudioSummary(thread.id, user.id, pending)

  after(async () => {
    try {
      await generateAudioSummary(thread, model)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[polly] audio summary generation failed:', message)
      await setAudioSummary(thread.id, user.id, {
        ...(existing ?? {}),
        status: 'error',
        error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
    }
  })

  return NextResponse.json({ audio_summary: pending }, { status: 202 })
}
