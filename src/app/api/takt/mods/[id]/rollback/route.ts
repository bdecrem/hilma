import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { bundle, getMod, rollBack } from '@/lib/takt/mods'

export const runtime = 'nodejs'

// POST /api/takt/mods/[id]/rollback { version } — the mod goes back to that version's song,
// charting and title, as a new version (the history stays). Returns the bundle.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as { version?: unknown } | null
  const version = body?.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return NextResponse.json({ error: 'version (a whole number) required.' }, { status: 400 })
  }
  const mod = await getMod(user.id, id)
  if (!mod) return NextResponse.json({ error: 'No such mod.' }, { status: 404 })
  const r = await rollBack(mod, version)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ mod: await bundle(mod) })
}
