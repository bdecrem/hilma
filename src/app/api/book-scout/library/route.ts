import { NextResponse } from 'next/server'
import { authed } from '@/lib/book-scout/db'
import { getFictionLibrary } from '@/lib/book-scout/library'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/book-scout/library — the reader's FICTION shelf, for Claude Code
// Picks. Gated (it's the reader's personal reading list), so the monthly
// routine sends the x-book-scout-key header.
export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const books = await getFictionLibrary()
  return NextResponse.json({
    count: books.length,
    books: books.map((b) => ({ title: b.title, author: b.author, type: b.type })),
  })
}
