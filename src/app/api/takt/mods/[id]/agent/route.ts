import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { bundle, getMod } from '@/lib/takt/mods'
import { parseContext, runModTurn } from '@/lib/takt/mod-agent'
import { sseResponse } from '@/lib/takt/sse'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST /api/takt/mods/[id]/agent { message, context } — the next turn on a mod, streamed like
// the first (status steps, then { type: 'done', mod }).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'JSON body required.' }, { status: 400 })
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required.' }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: 'That message is too long.' }, { status: 400 })
  const turn = parseContext(body.context)
  if (typeof turn === 'string') return NextResponse.json({ error: turn }, { status: 400 })
  const mod = await getMod(user.id, id)
  if (!mod) return NextResponse.json({ error: 'No such mod.' }, { status: 404 })
  return sseResponse(async (emit) => {
    await runModTurn(mod, message, turn, (e) => emit(e))
    emit({ type: 'done', mod: await bundle(mod) })
  })
}
