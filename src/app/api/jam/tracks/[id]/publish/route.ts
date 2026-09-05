// POST   /api/jam/tracks/:id/publish → publish (mints a slug once), returns meta
// DELETE /api/jam/tracks/:id/publish → unpublish (slug is kept so re-publishing keeps the link)

import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getJamUser } from '@/lib/jam/auth'
import { jamDb } from '@/lib/jam/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f-]{36}$/i
const META = 'id, title, bpm, bars, created_at, updated_at, published_at, slug, remix_of'

function newSlug() {
  // 8 lowercase alphanumerics, no confusable letters
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(8)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

async function setPublished(req: Request, ctx: { params: Promise<{ id: string }> }, publish: boolean) {
  const user = await getJamUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const db = jamDb()
  const { data: row } = await db.from('jam_tracks').select('id, slug, session').eq('id', id).eq('user_id', user.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (publish && !row.session) return NextResponse.json({ error: 'Nothing to publish yet — make some sound first.' }, { status: 400 })

  for (let attempt = 0; attempt < 5; attempt++) {
    const patch: Record<string, unknown> = { published_at: publish ? new Date().toISOString() : null }
    if (publish && !row.slug) patch.slug = newSlug()
    const { data, error } = await db.from('jam_tracks').update(patch).eq('id', id).eq('user_id', user.id).select(META).maybeSingle()
    if (error?.code === '23505') continue   // slug collision, try another
    if (error || !data) {
      console.error('[jam] publish', error)
      return NextResponse.json({ error: 'Could not update the track.' }, { status: 500 })
    }
    return NextResponse.json({ track: data })
  }
  return NextResponse.json({ error: 'Could not mint a link.' }, { status: 500 })
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) { return setPublished(req, ctx, true) }
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) { return setPublished(req, ctx, false) }
