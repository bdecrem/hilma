import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { suspendCard } from '@/lib/f3/cards'

export const runtime = 'nodejs'

// DELETE /api/f3/cards/[id]
// Suspend a card — it leaves the queue but keeps its review history.
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { id } = await ctx.params
  const ok = await suspendCard(user.id, id)
  if (!ok) return NextResponse.json({ error: 'delete failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
