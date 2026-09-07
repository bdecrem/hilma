// GET    /api/jam/tracks/:id → full track (session, messages, feed)
// PUT    /api/jam/tracks/:id → save any subset of { title, bpm, bars, session, messages, feed, rating (1–5 or null) }
// DELETE /api/jam/tracks/:id

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'
import { maybeRefreshTaste } from '@/lib/jam/taste'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FULL = 'id, title, bpm, bars, session, messages, feed, created_at, updated_at, published_at, slug, remix_of, rating'
const UUID_RE = /^[0-9a-f-]{36}$/i

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const { data, error } = await jamDb()
    .from('jam_tracks')
    .select(FULL)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('[jam] get track', error)
    return NextResponse.json({ error: 'Could not load the track.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ track: data })
}

export async function PUT(req: Request, ctx: Ctx) {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  let body: {
    title?: unknown; bpm?: unknown; bars?: unknown
    session?: unknown; messages?: unknown; feed?: unknown; rating?: unknown
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.title === 'string') patch.title = body.title.trim().slice(0, 80) || 'Untitled'
  if (typeof body.bpm === 'number' && Number.isFinite(body.bpm)) patch.bpm = Math.round(body.bpm)
  if (typeof body.bars === 'number' && Number.isFinite(body.bars)) patch.bars = Math.round(body.bars)
  if (body.session !== undefined) patch.session = body.session
  if (Array.isArray(body.messages)) patch.messages = body.messages
  if (Array.isArray(body.feed)) patch.feed = body.feed
  // Star rating of the whole creation (taste signal): 1–5, null clears it.
  let ratingChanged = false
  if (body.rating === null) { patch.rating = null; ratingChanged = true }
  else if (typeof body.rating === 'number' && Number.isInteger(body.rating) && body.rating >= 1 && body.rating <= 5) { patch.rating = body.rating; ratingChanged = true }

  const { data, error } = await jamDb()
    .from('jam_tracks')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, title, bpm, bars, created_at, updated_at, rating')
    .maybeSingle()
  if (error) {
    console.error('[jam] save track', error)
    return NextResponse.json({ error: 'Could not save the track.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (ratingChanged) {
    // A rating is a taste signal; the note is a bonus on top of a saved rating.
    try { await maybeRefreshTaste(user.id) } catch (e) { console.error('[jam] taste after rating', (e as Error).message) }
  }
  return NextResponse.json({ track: data })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const { error } = await jamDb()
    .from('jam_tracks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) {
    console.error('[jam] delete track', error)
    return NextResponse.json({ error: 'Could not delete the track.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
