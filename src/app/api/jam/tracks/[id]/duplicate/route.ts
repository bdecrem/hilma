// POST /api/jam/tracks/:id/duplicate → a full copy (session, chat history,
// feed) of one of the signed-in user's tracks, titled "<title> copy".

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const db = jamDb()
  const { data: src, error } = await db
    .from('jam_tracks')
    .select('title, bpm, bars, session, messages, feed')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    console.error('[jam] duplicate read', error)
    return NextResponse.json({ error: 'Could not read the track.' }, { status: 500 })
  }
  if (!src) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const base = String(src.title || 'Untitled').replace(/ copy( \d+)?$/, '')
  const title = `${base} copy`.slice(0, 80)
  const { data, error: insErr } = await db
    .from('jam_tracks')
    .insert({ user_id: user.id, title, bpm: src.bpm, bars: src.bars, session: src.session, messages: src.messages, feed: src.feed })
    .select('id, title, bpm, bars, created_at, updated_at')
    .single()
  if (insErr || !data) {
    console.error('[jam] duplicate insert', insErr)
    return NextResponse.json({ error: 'Could not duplicate the track.' }, { status: 500 })
  }
  return NextResponse.json({ track: data })
}
