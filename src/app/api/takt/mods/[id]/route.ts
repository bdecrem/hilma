import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { bundle, deleteMod, getMod } from '@/lib/takt/mods'

export const runtime = 'nodejs'

// GET /api/takt/mods/[id] — the whole bundle: the song file, the charting override, the thread.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await ctx.params
  const mod = await getMod(user.id, id)
  if (!mod) return NextResponse.json({ error: 'No such mod.' }, { status: 404 })
  return NextResponse.json({ mod: await bundle(mod) })
}

// DELETE /api/takt/mods/[id]
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await ctx.params
  const gone = await deleteMod(user.id, id)
  if (!gone) return NextResponse.json({ error: 'No such mod.' }, { status: 404 })
  return NextResponse.json({ deleted: true })
}
