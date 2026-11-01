import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { getMod, listVersions } from '@/lib/takt/mods'

export const runtime = 'nodejs'

// GET /api/takt/mods/[id]/versions — the mod's history: v0 the original as cloned, then one
// per turn that changed it (version, title, line, the ask, when).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await ctx.params
  const mod = await getMod(user.id, id)
  if (!mod) return NextResponse.json({ error: 'No such mod.' }, { status: 404 })
  return NextResponse.json({ version: mod.version, versions: await listVersions(mod.id) })
}
