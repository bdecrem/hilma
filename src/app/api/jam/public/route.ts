// GET /api/jam/public → the catalog: every published track, newest first. No auth.

import { NextResponse } from 'next/server'
import { jamDb } from '@/lib/jam/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const { data, error } = await jamDb()
    .from('jam_tracks')
    .select('slug, title, bpm, bars, published_at, remix_of, jam_users(username)')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[jam] catalog', error)
    return NextResponse.json({ error: 'Could not load the catalog.' }, { status: 500 })
  }
  const tracks = (data ?? []).map((t) => {
    const u = t.jam_users as unknown as { username: string } | { username: string }[] | null
    const username = Array.isArray(u) ? u[0]?.username : u?.username
    return { slug: t.slug, title: t.title, bpm: t.bpm, bars: t.bars, published_at: t.published_at, remix: !!t.remix_of, username: username ?? 'someone' }
  })
  return NextResponse.json({ tracks })
}
