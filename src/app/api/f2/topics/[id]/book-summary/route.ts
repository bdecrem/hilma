import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import {
  bookSummaryForClient,
  generateBookSummary,
  setBookSummary,
  type BookSummary,
} from '@/lib/f2/book-summary'

export const runtime = 'nodejs'
// Web search + a ~1,300-word Opus document takes a while; the work runs
// inside after().
export const maxDuration = 300

// A 'generating' row older than this is considered dead (function timed out
// or crashed before it could mark the error) and may be retried.
const STALE_GENERATING_MS = 6 * 60 * 1000

// GET /api/f2/topics/[id]/book-summary — the full summary (markdown and all).
// The topics list only carries status; this is the reader's fetch.
export async function GET(
  _req: Request,
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
  const b = thread.book_summary
  return NextResponse.json({
    book_summary: b
      ? {
          status: b.status,
          markdown: b.markdown ?? null,
          error: b.error ?? null,
          updated_at: b.updated_at ?? null,
        }
      : null,
  })
}

// POST /api/f2/topics/[id]/book-summary — kick off generation. Returns 202
// immediately with { book_summary: { status: 'generating' } }; the search +
// write continues via after(). Clients poll GET (or the topics list) until
// status flips to ready/error.
export async function POST(
  _req: Request,
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

  // Don't double-spend on a generation that's already in flight.
  const existing = thread.book_summary
  if (existing?.status === 'generating') {
    const startedAt = Date.parse(existing.updated_at ?? '') || 0
    if (Date.now() - startedAt < STALE_GENERATING_MS) {
      return NextResponse.json(
        { error: 'already generating', book_summary: bookSummaryForClient(existing) },
        { status: 409 },
      )
    }
  }

  const pending: BookSummary = {
    status: 'generating',
    updated_at: new Date().toISOString(),
  }
  await setBookSummary(thread.id, user.id, pending)

  after(async () => {
    await generateBookSummary(thread)
  })

  return NextResponse.json(
    { book_summary: bookSummaryForClient(pending) },
    { status: 202 },
  )
}
