import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { deleteFlashCard, updateFlashCard, type CardRating } from '@/lib/f2/flash'

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
  let body: {
    question?: string
    answer?: string
    distractors?: string[]
    rating?: string | null
    grading_note?: string | null
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  // `rating` absent = leave it alone; explicit null = clear it.
  let rating: CardRating | null | undefined
  if ('rating' in body) {
    if (body.rating === null) rating = null
    else if (body.rating === 'down' || body.rating === 'down1' || body.rating === 'priority')
      rating = body.rating
    else {
      return NextResponse.json({ error: 'invalid rating' }, { status: 400 })
    }
  }
  const { cardId } = await ctx.params
  const card = await updateFlashCard(user.id, cardId, {
    question: body.question,
    answer: body.answer,
    distractors: body.distractors,
    rating,
    ...('grading_note' in body ? { grading_note: body.grading_note } : {}),
  })
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
