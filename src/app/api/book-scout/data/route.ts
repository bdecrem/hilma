import { NextResponse } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/book-scout/data — config + sources + digest archive (open read).
export async function GET() {
  const db = bookScoutDb()
  const [{ data: config }, { data: sources }, { data: digests }, { data: genres }] = await Promise.all([
    db.from('book_scout_config').select('genre, reference_books, deliver_to, notes').eq('id', 1).maybeSingle(),
    db.from('book_scout_sources').select('id, name, url, type, notes, genre, active').order('name'),
    db.from('book_scout_digests').select('id, month_label, genre, books, created_at').order('created_at', { ascending: false }),
    db.from('book_scout_genres').select('slug, label, sort').eq('active', true).order('sort'),
  ])

  return NextResponse.json({
    config: config ?? { genre: 'thrillers', reference_books: '', deliver_to: '', notes: '' },
    sources: sources ?? [],
    digests: digests ?? [],
    genres: genres ?? [],
  })
}
