import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { distillCards } from '@/lib/f3/distill'
import { insertCards, listCardsForThread } from '@/lib/f3/cards'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/f3/topics/[id]/distill
// Extract idea cards from the topic's sources + conversation and add them to
// the review deck. Idempotent-ish: existing prompts are passed to the model
// so a re-distill only adds genuinely new ideas.
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

  const existing = await listCardsForThread(user.id, id)
  if (!thread.content && (thread.messages ?? []).length === 0 && (thread.additional_sources ?? []).length === 0) {
    return NextResponse.json(
      { error: 'nothing to distill — add a source or chat about the topic first' },
      { status: 422 },
    )
  }

  try {
    const distilled = await distillCards(thread, existing.map((c) => c.prompt))
    const inserted = await insertCards(user.id, id, distilled)
    return NextResponse.json({
      added: inserted.length,
      cards: [...existing, ...inserted],
    })
  } catch (e) {
    console.error('[f3] distill failed:', e)
    return NextResponse.json({ error: 'distillation failed' }, { status: 502 })
  }
}
