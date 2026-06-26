import { NextResponse } from 'next/server'
import { bookScoutDb, authed } from '@/lib/book-scout/db'

export const runtime = 'nodejs'

// PUT /api/book-scout/config — update genre / reference books / deliver-to / notes.
export async function PUT(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { genre?: string; reference_books?: string; deliver_to?: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const update: Record<string, string> = { updated_at: new Date().toISOString() }
  if (typeof body.genre === 'string') update.genre = body.genre.trim().toLowerCase()
  if (typeof body.reference_books === 'string') update.reference_books = body.reference_books
  if (typeof body.deliver_to === 'string') update.deliver_to = body.deliver_to.trim()
  if (typeof body.notes === 'string') update.notes = body.notes

  if (update.genre === '') return NextResponse.json({ error: 'genre cannot be empty' }, { status: 400 })

  const { error } = await bookScoutDb().from('book_scout_config').update(update).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
