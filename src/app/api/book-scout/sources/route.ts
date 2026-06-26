import { NextResponse } from 'next/server'
import { bookScoutDb, authed } from '@/lib/book-scout/db'

export const runtime = 'nodejs'

// POST /api/book-scout/sources — add a human-curator source.
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { name?: string; url?: string; type?: string; notes?: string; genre?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const name = body.name?.trim()
  const url = body.url?.trim()
  if (!name || !url) return NextResponse.json({ error: 'name and url required' }, { status: 400 })

  const row = {
    name,
    url,
    type: body.type?.trim() || 'editorial',
    notes: body.notes?.trim() || '',
    genre: body.genre?.trim().toLowerCase() || 'thrillers',
    active: true,
  }
  const { data, error } = await bookScoutDb().from('book_scout_sources').insert(row).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ source: data })
}
