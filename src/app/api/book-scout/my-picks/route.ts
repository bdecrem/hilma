import { NextResponse, after } from 'next/server'
import { bookScoutDb } from '@/lib/book-scout/db'
import { getSessionUser } from '@/lib/book-scout/auth'
import { getUserLibrary, getUserOwnedTitles, filterOwned } from '@/lib/book-scout/library'
import { researchClaudePicks, generateTasteProfile } from '@/lib/book-scout/research'

export const runtime = 'nodejs'
export const maxDuration = 300

function monthLabel(d: Date): string {
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'America/Los_Angeles' })
}

// POST /api/book-scout/my-picks — generate the signed-in user's Claude Code
// Picks from their stored taste profile (not the full library). Async; the
// page polls /auth/me.
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'sign in first' }, { status: 401 })

  const db = bookScoutDb()
  const { data: u } = await db.from('book_scout_users').select('taste_profile').eq('id', user.id).maybeSingle()
  const ownedCount = (await getUserOwnedTitles(user.id)).size
  if (ownedCount === 0) return NextResponse.json({ error: 'upload your books first' }, { status: 400 })

  const now = new Date()
  const label = monthLabel(now)
  const today = now.toISOString().slice(0, 10)

  after(async () => {
    try {
      // Build the taste profile once if it's missing (e.g. older account).
      let profile = u?.taste_profile as string | null
      if (!profile) {
        profile = await generateTasteProfile(await getUserLibrary(user.id))
        await db.from('book_scout_users').update({ taste_profile: profile, profile_updated_at: new Date().toISOString() }).eq('id', user.id)
      }
      const owned = await getUserOwnedTitles(user.id)
      const picks = filterOwned(await researchClaudePicks({ tasteProfile: profile, today }), owned)
      await db.from('book_scout_user_picks').insert({ user_id: user.id, month_label: label, picks })
    } catch {
      await db.from('book_scout_user_picks').insert({ user_id: user.id, month_label: label, picks: [] })
    }
  })

  return NextResponse.json({ started: true })
}
