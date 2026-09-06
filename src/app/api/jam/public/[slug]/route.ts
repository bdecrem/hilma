// GET    /api/jam/public/:slug → one published track with its session (playable by anyone).
// PATCH  /api/jam/public/:slug → { title } — admins only: rename any catalog track
// DELETE /api/jam/public/:slug → admins only: delete any catalog track (the owner's copy too)

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'
import { stripFromSession } from '@/lib/jam/strip'

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
    track: { slug: data.slug, title: data.title, bpm: data.bpm, bars: data.bars, session: data.session, published_at: data.published_at, remix: !!data.remix_of, username: username ?? 'someone', strip: stripFromSession(data.session) },
  })
}

/** The signed-in admin, or the response to send instead. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const user = await getJamUser()
  if (!user) return { ok: false, res: NextResponse.json({ error: 'not signed in' }, { status: 401 }) }
  if (!user.admin) return { ok: false, res: NextResponse.json({ error: 'admins only' }, { status: 403 }) }
  return { ok: true }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const { slug } = await ctx.params
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'bad link' }, { status: 400 })
  let body: { title?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : ''
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })
  const { data, error } = await jamDb()
    .from('jam_tracks')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('slug', slug)
    .not('published_at', 'is', null)
    .select('slug, title')
    .maybeSingle()
  if (error) {
    console.error('[jam] admin rename', error)
    return NextResponse.json({ error: 'Could not rename the track.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ track: data })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const gate = await requireAdmin()
  if (!gate.ok) return gate.res
  const { slug } = await ctx.params
  if (!SLUG_RE.test(slug)) return NextResponse.json({ error: 'bad link' }, { status: 400 })
  const { data, error } = await jamDb()
    .from('jam_tracks')
    .delete()
    .eq('slug', slug)
    .not('published_at', 'is', null)
    .select('id')
  if (error) {
    console.error('[jam] admin delete', error)
    return NextResponse.json({ error: 'Could not delete the track.' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
