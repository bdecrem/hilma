import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { parseRequest } from '@/lib/takt/improv-agent'
import { parseReview, runSoloTrack } from '@/lib/takt/solo-agent'
import { sseResponse } from '@/lib/takt/sse'
import { looksLikeSong, validateSong } from '@/lib/takt/songfile'
import { type SongOverride, ladder, looksLikeCharting, validateOverride } from '@/lib/takt/charting'

export const runtime = 'nodejs'
export const maxDuration = 800

// POST /api/takt/improv/track { take, backing, context, review, song, base, base_title,
// charting, song_charting? } — after a review, the improv teacher writes the whole track: a
// solo over every bar of `song` (the backing's file, as the app has it) grown from the
// review's idea, saved as the player's solo of `base` (a takt_mods row of kind 'solo', the
// Solo level on that song). `charting` is the app's charting.json, `song_charting` the song's
// own override. Streamed: { type: 'status', text } per step, then { type: 'track', mod, title,
// line } with the bundle, then { type: 'done' }; or { type: 'error', text }.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'JSON body required.' }, { status: 400 })
  const parsed = parseRequest(body)
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 })
  const review = parseReview(body.review)
  if (typeof review === 'string') return NextResponse.json({ error: review }, { status: 400 })
  if (!looksLikeCharting(body.charting)) return NextResponse.json({ error: 'charting must be the app’s charting.json.' }, { status: 400 })
  if (!looksLikeSong(body.song)) return NextResponse.json({ error: 'song must be a Takt song file.' }, { status: 400 })
  const problem = validateSong(body.song, ladder(body.charting, 'chords').keep)
  if (problem) return NextResponse.json({ error: `That song file is not sound: ${problem}` }, { status: 400 })
  const base = typeof body.base === 'string' && body.base ? body.base : body.song.name
  const baseTitle = typeof body.base_title === 'string' && body.base_title ? body.base_title : body.song.song.title
  let override: SongOverride | null = null
  if (body.song_charting != null) {
    if (typeof body.song_charting !== 'object') return NextResponse.json({ error: 'song_charting must be an object.' }, { status: 400 })
    override = body.song_charting as SongOverride
    const bad = validateOverride(body.charting, override)
    if (bad) return NextResponse.json({ error: `That charting override is not allowed: ${bad}` }, { status: 400 })
  }
  const charting = body.charting
  const song = body.song
  return sseResponse(async (emit) => {
    await runSoloTrack(parsed, review, base, baseTitle, song, charting, override, user.id, (e) => emit(e))
    emit({ type: 'done' })
  })
}
