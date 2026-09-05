// GET /api/jam/public/:slug → one published track with its session (playable by anyone).

import { NextResponse } from 'next/server'
import { jamDb } from '@/lib/jam/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9]{4,16}$/

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'bad link' }, { status: 400 })
  const { data, error } = await jamDb()
    .from('jam_tracks')
    .select('slug, title, bpm, bars, session, published_at, remix_of, jam_users(username)')
    .eq('slug', slug)
    .not('published_at', 'is', null)
    .maybeSingle()
  if (error) {
    console.error('[jam] public track', error)
    return NextResponse.json({ error: 'Could not load the track.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const u = data.jam_users as unknown as { username: string } | { username: string }[] | null
  const username = Array.isArray(u) ? u[0]?.username : u?.username
  return NextResponse.json({
    track: { slug: data.slug, title: data.title, bpm: data.bpm, bars: data.bars, session: data.session, published_at: data.published_at, remix: !!data.remix_of, username: username ?? 'someone' },
  })
}
