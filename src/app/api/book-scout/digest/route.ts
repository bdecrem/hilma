import { NextResponse } from 'next/server'
import { bookScoutDb, authed } from '@/lib/book-scout/db'
import { buildDigestHtml, sendDigestEmail, type Book, type ClaudePick } from '@/lib/book-scout/email'
import { getOwnedTitles, filterOwned } from '@/lib/book-scout/library'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/book-scout/digest — the monthly cloud agent posts its researched
// books here. Server-side: dedup against the reader's library, save to the
// archive, AND email the digest. Keeps SendGrid + DB credentials in Vercel.
//
// Body: { month_label, genre?, books: Book[], source_names?, claude_picks?: ClaudePick[] }
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: {
    month_label?: string
    genre?: string
    books?: Book[]
    source_names?: string[]
    claude_picks?: ClaudePick[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const monthLabel = body.month_label?.trim()
  if (!monthLabel || !Array.isArray(body.books) || body.books.length === 0) {
    return NextResponse.json({ error: 'month_label and non-empty books[] required' }, { status: 400 })
  }

  const db = bookScoutDb()
  const { data: config } = await db
    .from('book_scout_config')
    .select('genre, deliver_to')
    .eq('id', 1)
    .maybeSingle()
  const genre = body.genre?.trim() || config?.genre || 'thrillers'
  const deliverTo = config?.deliver_to || 'bdecrem@gmail.com'

  // Drop anything the reader already owns or sampled.
  const owned = await getOwnedTitles()
  const books = filterOwned(body.books, owned)
  const claudePicks = filterOwned(Array.isArray(body.claude_picks) ? body.claude_picks : [], owned)
  if (books.length === 0) {
    return NextResponse.json({ error: 'all books were already in the library' }, { status: 400 })
  }

  const { error: insErr } = await db
    .from('book_scout_digests')
    .insert({ month_label: monthLabel, genre, books, claude_picks: claudePicks })
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const sourceNames =
    body.source_names && body.source_names.length
      ? body.source_names
      : [...new Set(books.flatMap((b) => b.sources.map((s) => s.name.split(' (')[0])))]
  const html = buildDigestHtml(books, monthLabel, genre, sourceNames, claudePicks)
  const capGenre = genre.charAt(0).toUpperCase() + genre.slice(1)
  const email = await sendDigestEmail(
    deliverTo,
    `dog ear · ${capGenre}, ${monthLabel} (${books.length} on Kindle now)`,
    html,
  )

  return NextResponse.json({
    saved: true,
    books: books.length,
    claude_picks: claudePicks.length,
    emailed: email.ok,
    email_status: email.status,
    email_error: email.error,
  })
}
