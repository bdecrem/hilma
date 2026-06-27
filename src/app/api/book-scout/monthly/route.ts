import { NextResponse, after } from 'next/server'
import { bookScoutDb, authed } from '@/lib/book-scout/db'
import { researchBooks, researchClaudePicks, generateTasteProfile } from '@/lib/book-scout/research'
import { getUserLibrary, getUserOwnedTitles, filterOwned } from '@/lib/book-scout/library'
import { buildDigestHtml, sendDigestEmail, type Book } from '@/lib/book-scout/email'

export const runtime = 'nodejs'
export const maxDuration = 800

function sourceMatches(sourceGenre: string, genre: string): boolean {
  const tags = sourceGenre.split(',').map((t) => t.trim().toLowerCase())
  return tags.includes('general') || tags.includes(genre.toLowerCase())
}
function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' })
}

// POST /api/book-scout/monthly — THE monthly run. Key-gated (called by the cron).
// 1) builds this month's shared Staff Picks once, 2) builds each user's personal
// Claude Code Picks from their taste profile, 3) emails every signed-up user
// their issue (staff picks + their picks). Work runs in after().
export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const db = bookScoutDb()

  const now = new Date()
  const label = monthLabel(now)
  const today = now.toISOString().slice(0, 10)

  after(async () => {
    // ---- 1. Shared Staff Picks (one run for everyone) ----
    const [{ data: config }, { data: allSources }] = await Promise.all([
      db.from('book_scout_config').select('genre, reference_books').eq('id', 1).maybeSingle(),
      db.from('book_scout_sources').select('name, url, type, notes, genre, active'),
    ])
    const genre = config?.genre || 'thrillers'
    const sources = (allSources ?? [])
      .filter((s) => s.active && sourceMatches(s.genre, genre))
      .map((s) => ({ name: s.name, url: s.url, type: s.type, notes: s.notes }))

    let staffBooks: Book[] = []
    let sourceNames: string[] = []
    try {
      const r = await researchBooks({ genre, referenceBooks: config?.reference_books || '', sources, today })
      staffBooks = r.books
      sourceNames = r.sourceNames
      await db.from('book_scout_digests').insert({ month_label: label, genre, books: staffBooks, claude_picks: [] })
    } catch {
      // Fall back to the most recent staff issue so the run still goes out.
      const { data: last } = await db.from('book_scout_digests').select('books, genre').order('created_at', { ascending: false }).limit(1).maybeSingle()
      staffBooks = (last?.books as Book[]) || []
    }
    if (staffBooks.length) {
      sourceNames = sourceNames.length ? sourceNames : [...new Set(staffBooks.flatMap((b) => b.sources.map((s) => s.name.split(' (')[0])))]
    }

    // ---- 2 + 3. Per-user picks + email ----
    const { data: users } = await db.from('book_scout_users').select('id, email, taste_profile')
    const capGenre = genre.charAt(0).toUpperCase() + genre.slice(1)

    for (const u of users ?? []) {
      try {
        const owned = await getUserOwnedTitles(u.id)
        let picks: Awaited<ReturnType<typeof researchClaudePicks>> = []
        if (owned.size > 0) {
          let profile = u.taste_profile as string | null
          if (!profile) {
            profile = await generateTasteProfile(await getUserLibrary(u.id))
            await db.from('book_scout_users').update({ taste_profile: profile, profile_updated_at: new Date().toISOString() }).eq('id', u.id)
          }
          picks = filterOwned(await researchClaudePicks({ tasteProfile: profile, today }), owned).slice(0, 5)
          await db.from('book_scout_user_picks').insert({ user_id: u.id, month_label: label, picks })
        }
        const html = buildDigestHtml(staffBooks, label, genre, sourceNames, picks)
        await sendDigestEmail(u.email, `Dog-Ear — ${capGenre}, ${label} (${staffBooks.length} on Kindle now)`, html)
      } catch {
        // one user's failure shouldn't stop the rest
      }
    }
  })

  return NextResponse.json({ started: true, month: label })
}
