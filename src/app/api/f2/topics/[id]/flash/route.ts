import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import {
  generateFlashCards,
  listFlashCards,
  listFlashSets,
} from '@/lib/f2/flash'

export const runtime = 'nodejs'
// Generation is one big LLM call over the topic's source material.
export const maxDuration = 120

// GET /api/f2/topics/[id]/flash — the topic's deck + set history.
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
  const [cards, sets] = await Promise.all([
    listFlashCards(user.id, id),
    listFlashSets(user.id, id),
  ])
  return NextResponse.json({ cards, sets, stars: thread.stars })
}

// POST /api/f2/topics/[id]/flash — generate {count} cards for the topic.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { count?: number; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const count = Number(body.count)
  if (!Number.isFinite(count) || count < 1) {
    return NextResponse.json({ error: 'count required' }, { status: 400 })
  }
  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  try {
    const cards = await generateFlashCards(thread, count, body.model)
    return NextResponse.json({ cards })
  } catch (e) {
    console.error('[f2/flash] generate failed:', e)
    const message = e instanceof Error ? e.message : 'generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
