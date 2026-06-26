import { NextResponse } from 'next/server'
import { bookScoutDb, authed } from '@/lib/book-scout/db'

export const runtime = 'nodejs'

// PATCH /api/book-scout/sources/[id] — toggle active or edit fields.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params

  let body: { active?: boolean; name?: string; url?: string; type?: string; notes?: string; genre?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.active === 'boolean') update.active = body.active
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (typeof body.url === 'string') update.url = body.url.trim()
  if (typeof body.type === 'string') update.type = body.type.trim()
  if (typeof body.notes === 'string') update.notes = body.notes
  if (typeof body.genre === 'string') update.genre = body.genre.trim().toLowerCase()
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'nothing to update' }, { status: 400 })

  const { error } = await bookScoutDb().from('book_scout_sources').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/book-scout/sources/[id]
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const { error } = await bookScoutDb().from('book_scout_sources').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
