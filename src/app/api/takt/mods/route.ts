import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { bundle, createMod, listMods, summary } from '@/lib/takt/mods'
import { parseContext, runModTurn } from '@/lib/takt/mod-agent'
import { sseResponse } from '@/lib/takt/sse'
import { looksLikeSong, validateSong } from '@/lib/takt/songfile'
import { ladder, validateOverride, type SongOverride } from '@/lib/takt/charting'

export const runtime = 'nodejs'
export const maxDuration = 800

// GET /api/takt/mods — the user's mods, newest last, without their songs.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const mods = await listMods(user.id)
  return NextResponse.json({ mods: mods.map(summary) })
}

// POST /api/takt/mods { base, base_title, song, charting?, message, context } — a new mod of
// `song` (the app sends the file, bundled or another mod's), then the agent's first turn,
// streamed: { type: 'mod', mod } once the row exists, { type: 'status', text } per step,
// { type: 'done', mod } with the whole bundle at the end, or { type: 'error', text }.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'JSON body required.' }, { status: 400 })
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message required.' }, { status: 400 })
  if (message.length > 4000) return NextResponse.json({ error: 'That message is too long.' }, { status: 400 })
  const ctx = parseContext(body.context)
  if (typeof ctx === 'string') return NextResponse.json({ error: ctx }, { status: 400 })
  if (!looksLikeSong(body.song)) return NextResponse.json({ error: 'song must be a Takt song file.' }, { status: 400 })
  const problem = validateSong(body.song, ladder(ctx.charting, 'chords').keep)
  if (problem) return NextResponse.json({ error: `That song file is not sound: ${problem}` }, { status: 400 })
  const base = typeof body.base === 'string' && body.base ? body.base : body.song.name
  const baseTitle = typeof body.base_title === 'string' && body.base_title ? body.base_title : body.song.song.title
  let override: SongOverride | null = null
  if (body.charting != null) {
    if (typeof body.charting !== 'object') return NextResponse.json({ error: 'charting must be an object.' }, { status: 400 })
    override = body.charting as SongOverride
    const bad = validateOverride(ctx.charting, override)
    if (bad) return NextResponse.json({ error: `That charting override is not allowed: ${bad}` }, { status: 400 })
  }
  const mod = await createMod(user.id, base, baseTitle, body.song, override)
  return sseResponse(async (emit) => {
    emit({ type: 'mod', mod: summary(mod) })
    await runModTurn(mod, message, ctx, (e) => emit(e))
    emit({ type: 'done', mod: await bundle(mod) })
  })
}
