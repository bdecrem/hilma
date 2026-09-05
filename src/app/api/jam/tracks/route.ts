// GET  /api/jam/tracks  → the signed-in user's tracks (metadata only)
// POST /api/jam/tracks  → create an empty track

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'
import { stripFromSession } from '@/lib/jam/strip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TRACK_META = 'id, title, bpm, bars, created_at, updated_at, published_at, slug, remix_of'

export async function GET() {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const { data, error } = await jamDb()
    .from('jam_tracks')
    .select(`${TRACK_META}, session`)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[jam] list tracks', error)
    return NextResponse.json({ error: 'Could not load tracks.' }, { status: 500 })
  }
  // The session travels only to compute the rhythm strip for the card.
  const tracks = (data ?? []).map(({ session, ...meta }) => ({ ...meta, strip: stripFromSession(session) }))
  return NextResponse.json({ tracks })
}

export async function POST(req: Request) {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  let body: { title?: string; bpm?: number } = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const title = (body.title || 'Untitled').toString().slice(0, 80)
  const bpm = Number.isFinite(body.bpm) ? Math.round(body.bpm as number) : 128
  const { data, error } = await jamDb()
    .from('jam_tracks')
    .insert({ user_id: user.id, title, bpm })
    .select('id, title, bpm, bars, session, messages, feed, created_at, updated_at')
    .single()
  if (error || !data) {
    console.error('[jam] create track', error)
    return NextResponse.json({ error: 'Could not create the track.' }, { status: 500 })
  }
  return NextResponse.json({ track: data })
}
