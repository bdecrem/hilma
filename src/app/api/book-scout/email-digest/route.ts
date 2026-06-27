import { NextResponse } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'
import { isAdmin } from '@/lib/book-scout/auth'
import { buildDigestHtml, sendDigestEmail, type Book, type ClaudePick } from '@/lib/book-scout/email'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/book-scout/email-digest — email a saved digest on demand.
// Body: { digest_id?: string }  (defaults to the most recent digest)
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'admin only' }, { status: 401 })

  let body: { digest_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    // empty body is fine — defaults to latest
  }

  const db = bookScoutDb()
  const sel = db.from('book_scout_digests').select('id, month_label, genre, books, claude_picks')
  const { data: digest } = body.digest_id
    ? await sel.eq('id', body.digest_id).maybeSingle()
    : await sel.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!digest) return NextResponse.json({ error: 'digest not found' }, { status: 404 })

  const { data: config } = await db.from('book_scout_config').select('deliver_to').eq('id', 1).maybeSingle()
  const deliverTo = config?.deliver_to || 'bdecrem@gmail.com'

  const books = (digest.books || []) as Book[]
  const claudePicks = (digest.claude_picks || []) as ClaudePick[]
  const sourceNames: string[] = [
    ...new Set(books.flatMap((b) => b.sources.map((s) => s.name.split(' (')[0]))),
  ]
  const html = buildDigestHtml(books, digest.month_label, digest.genre, sourceNames, claudePicks)
  const capGenre = digest.genre.charAt(0).toUpperCase() + digest.genre.slice(1)
  const email = await sendDigestEmail(
    deliverTo,
    `dog ear · ${capGenre}, ${digest.month_label} (${books.length} on Kindle now)`,
    html,
  )
  if (!email.ok) return NextResponse.json({ error: email.error || 'email failed' }, { status: 500 })
  return NextResponse.json({ ok: true, to: deliverTo, books: books.length, claude_picks: claudePicks.length })
}
