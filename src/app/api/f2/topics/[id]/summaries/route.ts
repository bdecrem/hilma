import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { audioSummaryVersions } from '@/lib/f2/audio-summary'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// GET /api/f2/topics/[id]/summaries
// Full audio-summary transcripts for a topic, base first. Unlike the topics
// list (which strips transcript bodies), this returns each version's full
// `script` for the Topic Context reader. `current_id` marks the latest
// version — the one the Play chip's audio corresponds to.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: NO_STORE })
  }
  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404, headers: NO_STORE })
  }

  const summaries = audioSummaryVersions(thread.audio_summary)
  // Prefer the explicitly stored current_id; fall back to the last version for
  // legacy summaries that predate the field.
  const current_id =
    thread.audio_summary?.current_id
    ?? (summaries.length > 0 ? summaries[summaries.length - 1].id : null)
  const audio_url = thread.audio_summary?.status === 'ready' ? thread.audio_summary.url ?? null : null

  return NextResponse.json({ summaries, current_id, audio_url }, { headers: NO_STORE })
}
