import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { deleteFlashCard, updateFlashCard } from '@/lib/f2/flash'

export const runtime = 'nodejs'

// PATCH /api/f2/flash/cards/[cardId] — edit question / answer / distractors.
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ cardId: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { question?: string; answer?: string; distractors?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { cardId } = await ctx.params
  const card = await updateFlashCard(user.id, cardId, body)
  if (!card) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ card })
}

// DELETE /api/f2/flash/cards/[cardId]
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ cardId: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { cardId } = await ctx.params
  const ok = await deleteFlashCard(user.id, cardId)
  if (!ok) {
    return NextResponse.json({ error: 'delete failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
