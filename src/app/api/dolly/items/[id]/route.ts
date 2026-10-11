import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/dolly/auth'
import { deleteItem } from '@/lib/dolly/core'

export const runtime = 'nodejs'

// DELETE /api/dolly/items/:id — drop a kept word. Cards already dealt that
// point at it still grade; it just never comes back.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  const { id } = await ctx.params
  const gone = await deleteItem(user.id, id)
  if (!gone) return NextResponse.json({ error: 'No such card.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
