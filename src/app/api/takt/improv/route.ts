import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { parseRequest, runImprovReview } from '@/lib/takt/improv-agent'
import { sseResponse } from '@/lib/takt/sse'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST /api/takt/improv { take, backing, context } — the improv teacher reviews a take,
// streamed: status steps, then { type: 'review', review, id }, then { type: 'done' }.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const parsed = parseRequest(await req.json().catch(() => null))
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 })
  if (parsed.take.notes.length < 4) return NextResponse.json({ error: 'Play a few more notes first.' }, { status: 400 })
  return sseResponse(async (emit) => {
    await runImprovReview(parsed, user.id, (e) => emit(e))
    emit({ type: 'done' })
  })
}
