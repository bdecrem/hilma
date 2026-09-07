// GET  /api/jam/tracks/:id/snapshots → { snapshots: [{ turnId, createdAt }] } (newest first)
// POST /api/jam/tracks/:id/snapshots { turnId, session, messages, feed } → { ok }
//
// A snapshot is the track right after one agent turn; the Studio saves one
// per turn and keeps the KEEP most recent, so "↺" can take the user back.

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const KEEP = 5
const UUID_RE = /^[0-9a-f-]{36}$/i
const err = (error: string, status: number) => NextResponse.json({ error }, { status })
type Ctx = { params: Promise<{ id: string }> }

async function owns(userId: string, trackId: string): Promise<boolean> {
  const { data, error } = await jamDb().from('jam_tracks').select('id').eq('id', trackId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return err('bad id', 400)
  try {
    if (!(await owns(user.id, id))) return err('not found', 404)
    const { data, error } = await jamDb().from('jam_snapshots').select('turn_id, created_at').eq('track_id', id).order('created_at', { ascending: false }).limit(KEEP)
    if (error) throw new Error(error.message)
    return NextResponse.json({ snapshots: (data ?? []).map((r) => ({ turnId: r.turn_id, createdAt: r.created_at })) })
  } catch (e) {
    console.error('[jam] snapshots list', (e as Error).message)
    return err('Could not load the snapshots.', 500)
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return err('bad id', 400)
  let body: { turnId?: unknown; session?: unknown; messages?: unknown; feed?: unknown }
  try { body = await req.json() } catch { return err('Invalid JSON', 400) }
  const turnId = typeof body.turnId === 'string' ? body.turnId.trim().slice(0, 80) : ''
  if (!turnId) return err('turnId required', 400)
  if (body.session === undefined) return err('session required', 400)
  try {
    if (!(await owns(user.id, id))) return err('not found', 404)
    const db = jamDb()
    const { error } = await db.from('jam_snapshots').upsert(
      { track_id: id, user_id: user.id, turn_id: turnId, session: body.session, messages: Array.isArray(body.messages) ? body.messages : [], feed: Array.isArray(body.feed) ? body.feed : [], created_at: new Date().toISOString() },
      { onConflict: 'track_id,turn_id' },
    )
    if (error) throw new Error(error.message)
    // Keep the KEEP newest.
    const { data: all, error: le } = await db.from('jam_snapshots').select('id').eq('track_id', id).order('created_at', { ascending: false })
    if (le) throw new Error(le.message)
    const stale = (all ?? []).slice(KEEP).map((r) => r.id as string)
    if (stale.length) {
      const { error: de } = await db.from('jam_snapshots').delete().in('id', stale)
      if (de) throw new Error(de.message)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[jam] snapshot save', (e as Error).message)
    return err('Could not save the snapshot.', 500)
  }
}
