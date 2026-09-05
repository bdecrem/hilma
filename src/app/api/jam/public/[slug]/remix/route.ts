// POST /api/jam/public/:slug/remix → copy a published track into the signed-in
// user's library ("<title> remix", remix_of set). The chat history is not
// copied: a remix starts a fresh conversation over the same sound.

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9]{4,16}$/

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const { slug } = await ctx.params
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'bad link' }, { status: 400 })
  const db = jamDb()
  const { data: src } = await db
    .from('jam_tracks')
    .select('id, title, bpm, bars, session, jam_users(username)')
    .eq('slug', slug)
    .not('published_at', 'is', null)
    .maybeSingle()
  if (!src) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const u = src.jam_users as unknown as { username: string } | { username: string }[] | null
  const by = (Array.isArray(u) ? u[0]?.username : u?.username) ?? 'someone'
  const base = String(src.title || 'Untitled').replace(/ remix$/, '')
  const title = `${base} remix`.slice(0, 80)
  const feed = [{ id: `remix-${Date.now()}`, kind: 'note', text: `Remix of “${src.title}” by ${by}. Say what you want changed.` }]
  const { data, error } = await db
    .from('jam_tracks')
    .insert({ user_id: user.id, title, bpm: src.bpm, bars: src.bars, session: src.session, messages: [], feed, remix_of: src.id })
    .select('id, title, bpm, bars, created_at, updated_at')
    .single()
  if (error || !data) {
    console.error('[jam] remix', error)
    return NextResponse.json({ error: 'Could not remix the track.' }, { status: 500 })
  }
  return NextResponse.json({ track: data })
}
