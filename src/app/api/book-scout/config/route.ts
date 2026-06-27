import { NextResponse } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'
import { isAdmin } from '@/lib/book-scout/auth'

export const runtime = 'nodejs'

// PUT /api/book-scout/config — update genre / reference books / deliver-to / notes.
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'admin only' }, { status: 401 })

  let body: { genre?: string; reference_books?: string; deliver_to?: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const db = bookScoutDb()
  const update: Record<string, string> = { updated_at: new Date().toISOString() }
  if (typeof body.genre === 'string') update.genre = body.genre.trim().toLowerCase()
  if (typeof body.reference_books === 'string') update.reference_books = body.reference_books
  if (typeof body.deliver_to === 'string') update.deliver_to = body.deliver_to.trim()
  if (typeof body.notes === 'string') update.notes = body.notes

  if (update.genre === '') return NextResponse.json({ error: 'genre cannot be empty' }, { status: 400 })

  // Genre must be one of the known genres (the page only offers these).
  if (update.genre !== undefined) {
    const { data: g } = await db.from('book_scout_genres').select('slug').eq('slug', update.genre).maybeSingle()
    if (!g) return NextResponse.json({ error: `unknown genre "${update.genre}"` }, { status: 400 })
  }

  const { error } = await db.from('book_scout_config').update(update).eq('id', 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
