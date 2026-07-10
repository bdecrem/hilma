import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/omni/auth'
import { omniSupabase } from '@/lib/omni/supabase'
import { awardXp } from '@/lib/omni/progress'
import { reviewXp } from '@/lib/omni/xp'

export const runtime = 'nodejs'

type ReviewInput = { card_id: string; known: boolean }

/** Record a finished flash-card session: update per-card strength, award XP. */
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: { results?: ReviewInput[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const results = (body.results ?? []).filter(
    (r) => typeof r?.card_id === 'string' && typeof r?.known === 'boolean',
  )
  if (results.length === 0) {
    return NextResponse.json({ error: 'No results.' }, { status: 400 })
  }
  if (results.length > 100) {
    return NextResponse.json({ error: 'Too many results.' }, { status: 400 })
  }

  const sb = omniSupabase()
  const cardIds = results.map((r) => r.card_id)
  const { data: existing } = await sb
    .from('omni_reviews')
    .select('card_id, strength, review_count')
    .eq('user_id', user.id)
    .in('card_id', cardIds)
  const byCard = new Map((existing ?? []).map((r) => [r.card_id as string, r]))

  const now = new Date().toISOString()
  const rows = results.map((r) => {
    const prev = byCard.get(r.card_id)
    const strength = prev ? (prev.strength as number) : 0
    return {
      user_id: user.id,
      card_id: r.card_id,
      strength: r.known ? Math.min(5, strength + 1) : Math.max(0, strength - 1),
      review_count: (prev ? (prev.review_count as number) : 0) + 1,
      last_result: r.known ? 'known' : 'unknown',
      last_reviewed_at: now,
    }
  })
  const { error } = await sb
    .from('omni_reviews')
    .upsert(rows, { onConflict: 'user_id,card_id' })
  if (error) {
    console.error('[omni/review] upsert failed:', error)
    return NextResponse.json({ error: 'Could not save reviews.' }, { status: 500 })
  }

  const known = results.filter((r) => r.known).length
  const xp = await awardXp(user.id, user.language, reviewXp(results.length, known))
  return NextResponse.json({ xp })
}
