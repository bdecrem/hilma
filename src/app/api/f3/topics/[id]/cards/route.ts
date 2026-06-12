import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { listCardsForThread } from '@/lib/f3/cards'

export const runtime = 'nodejs'

// GET /api/f3/topics/[id]/cards
// The topic's active idea cards, plus its primer questions (if generated).
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

  const cards = await listCardsForThread(user.id, id)
  const primer = (thread as unknown as { primer?: string[] | null }).primer ?? null
  return NextResponse.json({ cards, primer })
}
