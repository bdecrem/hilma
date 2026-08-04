import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { getThreadById } from '@/lib/f2/threads'
import { redoFlashCards } from '@/lib/f2/flash'

export const runtime = 'nodejs'
export const maxDuration = 120

// POST /api/f2/topics/[id]/flash/redo — rebuild the whole deck to the
// user's instructions ("more anecdotal, a few big-picture questions"),
// replacing the existing cards. New cards land before old ones are removed,
// so a failed generation never loses the deck.
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { instructions?: string; model?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const instructions = body.instructions?.trim()
  if (!instructions) {
    return NextResponse.json({ error: 'instructions required' }, { status: 400 })
  }
  const { id } = await ctx.params
  const thread = await getThreadById(user.id, id)
  if (!thread) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  try {
    const cards = await redoFlashCards(thread, instructions, body.model)
    return NextResponse.json({ cards })
  } catch (e) {
    console.error('[f2/flash] redo failed:', e)
    const message = e instanceof Error ? e.message : 'deck redo failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
