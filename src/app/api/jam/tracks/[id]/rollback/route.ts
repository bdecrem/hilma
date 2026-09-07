// POST /api/jam/tracks/:id/rollback { turnId, dropped: [{ turnId, prompt, calls }] } → { ok }
//
// The client has restored the snapshot of `turnId` and saved the track; this
// drops the snapshots that came after it and records the dropped turns as
// `rollback` taste signals (the strongest implicit "no" there is).

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'
import { maybeRefreshTaste, recordSignal, trimCalls } from '@/lib/jam/taste'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i
const err = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return err('bad id', 400)
  let body: { turnId?: unknown; dropped?: unknown }
  try { body = await req.json() } catch { return err('Invalid JSON', 400) }
  const turnId = typeof body.turnId === 'string' ? body.turnId : ''
  if (!turnId) return err('turnId required', 400)
  const db = jamDb()
  try {
    const { data: snap, error } = await db.from('jam_snapshots').select('created_at').eq('track_id', id).eq('user_id', user.id).eq('turn_id', turnId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!snap) return err('not found', 404)
    const { error: de } = await db.from('jam_snapshots').delete().eq('track_id', id).gt('created_at', snap.created_at as string)
    if (de) throw new Error(de.message)
  } catch (e) {
    console.error('[jam] rollback', (e as Error).message)
    return err('Could not roll back.', 500)
  }
  // The dropped turns are rejected work — a taste signal each (best effort).
  const dropped = Array.isArray(body.dropped) ? body.dropped.slice(0, 10) : []
  try {
    for (const d of dropped) {
      if (!d || typeof d !== 'object') continue
      const t = d as { turnId?: unknown; prompt?: unknown; calls?: unknown }
      if (typeof t.turnId !== 'string' || !t.turnId) continue
      await recordSignal(user.id, {
        trackId: id,
        turnId: `rb:${t.turnId.slice(0, 70)}`,
        score: -2,
        source: 'rollback',
        prompt: typeof t.prompt === 'string' ? t.prompt.slice(0, 2000) : undefined,
        calls: trimCalls(t.calls),
        reason: 'rolled back to an earlier point',
      })
    }
    if (dropped.length) await maybeRefreshTaste(user.id)
  } catch (e) {
    console.error('[jam] rollback signals', (e as Error).message)
  }
  return NextResponse.json({ ok: true })
}
