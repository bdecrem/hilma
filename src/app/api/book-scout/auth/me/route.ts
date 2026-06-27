import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/book-scout/auth'
import { bookScoutDb } from '@/lib/book-scout/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/book-scout/auth/me — current user + their library size + latest picks.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ user: null })

  const db = bookScoutDb()
  const [{ count }, { data: picks }, { data: prof }] = await Promise.all([
    db.from('book_scout_library').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    db.from('book_scout_user_picks').select('month_label, picks, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('book_scout_users').select('taste_profile').eq('id', user.id).maybeSingle(),
  ])

  return NextResponse.json({
    user,
    library_count: count ?? 0,
    claude_picks: picks?.picks ?? [],
    picks_month: picks?.month_label ?? null,
    has_profile: !!prof?.taste_profile,
  })
}
