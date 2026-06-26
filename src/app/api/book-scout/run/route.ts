import { NextResponse, after } from 'next/server'
import { bookScoutDb, authed } from '@/lib/book-scout/db'
import { researchBooks } from '@/lib/book-scout/research'
import { getOwnedTitles, filterOwned } from '@/lib/book-scout/library'

export const runtime = 'nodejs'
export const maxDuration = 600

// A source's comma-separated genre list applies to genre G if it lists G or 'general'.
function sourceMatches(sourceGenre: string, genre: string): boolean {
  const tags = sourceGenre.split(',').map((t) => t.trim().toLowerCase())
  return tags.includes('general') || tags.includes(genre.toLowerCase())
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' })
}

// POST /api/book-scout/run — research the current genre now, then save + email.
// Returns immediately with a run id; the work continues via after().
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const db = bookScoutDb()
  const [{ data: config }, { data: allSources }] = await Promise.all([
    db.from('book_scout_config').select('genre, reference_books, deliver_to').eq('id', 1).maybeSingle(),
    db.from('book_scout_sources').select('name, url, type, notes, genre, active'),
  ])
  const genre = config?.genre || 'thrillers'
  const referenceBooks = config?.reference_books || ''
  const deliverTo = config?.deliver_to || 'bdecrem@gmail.com'

  const sources = (allSources ?? [])
    .filter((s) => s.active && sourceMatches(s.genre, genre))
    .map((s) => ({ name: s.name, url: s.url, type: s.type, notes: s.notes }))

  if (sources.length === 0) {
    return NextResponse.json({ error: `No active sources for genre "${genre}".` }, { status: 400 })
  }

  const now = new Date()
  const label = monthLabel(now)
  const today = now.toISOString().slice(0, 10)

  const { data: run, error: runErr } = await db
    .from('book_scout_runs')
    .insert({ status: 'running', genre, message: `Researching ${sources.length} sources…` })
    .select('id')
    .single()
  if (runErr || !run) return NextResponse.json({ error: runErr?.message || 'could not start' }, { status: 500 })

  after(async () => {
    try {
      const owned = await getOwnedTitles()

      // Re-run only refreshes the fast human-curated genre list (so it stays
      // well under the function timeout). Claude Code Picks depend on the
      // reader's library, not the genre, so they're regenerated monthly — here
      // we carry the most recent ones forward so the section stays populated.
      const research = await researchBooks({ genre, referenceBooks, sources, today })
      const books = filterOwned(research.books, owned)

      const { data: prev } = await db
        .from('book_scout_digests')
        .select('claude_picks')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const claudePicks = prev?.claude_picks ?? []

      const { data: digest, error: digErr } = await db
        .from('book_scout_digests')
        .insert({ month_label: label, genre, books, claude_picks: claudePicks })
        .select('id')
        .single()
      if (digErr || !digest) throw new Error(digErr?.message || 'save failed')

      await db
        .from('book_scout_runs')
        .update({
          status: 'done',
          digest_id: digest.id,
          finished_at: new Date().toISOString(),
          message: `${books.length} books (not emailed yet)`,
        })
        .eq('id', run.id)
    } catch (e) {
      await db
        .from('book_scout_runs')
        .update({ status: 'error', finished_at: new Date().toISOString(), message: (e as Error).message })
        .eq('id', run.id)
    }
  })

  return NextResponse.json({ run_id: run.id, genre, sources: sources.length })
}
