// POST /api/jam/signals { trackId, kind: 'bounce' } → { ok }
//
// Implicit whole-track taste signals from the clients (taste v2). Publish is
// recorded server-side by the publish route; a bounce (export) is reported
// here by the web Studio and the native BounceSheet once the file exists.

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'
import { maybeRefreshTaste, recordImplicit } from '@/lib/jam/taste'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i
const err = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: Request) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)
  let body: { trackId?: unknown; kind?: unknown }
  try { body = await req.json() } catch { return err('Invalid JSON', 400) }
  const trackId = typeof body.trackId === 'string' ? body.trackId : ''
  if (!UUID_RE.test(trackId)) return err('trackId required', 400)
  if (body.kind !== 'bounce') return err('kind must be "bounce"', 400)
  try {
    const { data, error } = await jamDb().from('jam_tracks').select('id, title').eq('id', trackId).eq('user_id', user.id).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return err('not found', 404)
    await recordImplicit(user.id, trackId, 'bounce', data.title as string)
  } catch (e) {
    console.error('[jam/signals] write', (e as Error).message)
    return err('Could not record the signal.', 500)
  }
  try { await maybeRefreshTaste(user.id) } catch (e) { console.error('[jam/signals] taste', (e as Error).message) }
  return NextResponse.json({ ok: true })
}
