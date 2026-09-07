// GET /api/jam/tracks/:id/snapshots/:turnId → { snapshot: { turnId, session, messages, feed, createdAt } }

import { NextResponse } from 'next/server'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i
const err = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; turnId: string }> }) {
  const user = await getJamUser()
  if (!user) return err('not signed in', 401)
  const { id, turnId } = await ctx.params
  if (!UUID_RE.test(id) || !turnId) return err('bad id', 400)
  const { data, error } = await jamDb()
    .from('jam_snapshots')
    .select('turn_id, session, messages, feed, created_at')
    .eq('track_id', id)
    .eq('user_id', user.id)
    .eq('turn_id', turnId)
    .maybeSingle()
  if (error) {
    console.error('[jam] snapshot get', error)
    return err('Could not load the snapshot.', 500)
  }
  if (!data) return err('not found', 404)
  return NextResponse.json({ snapshot: { turnId: data.turn_id, session: data.session, messages: data.messages, feed: data.feed, createdAt: data.created_at } })
}
