import { NextResponse } from 'next/server'
import { f2Supabase } from '@/lib/f2/supabase'
import { ensureUserIndexed } from '@/lib/f2/knowledge'

export const runtime = 'nodejs'
export const maxDuration = 300

// GET /api/f2/knowledge/backfill — keep every user's knowledge index fresh.
// Nightly Vercel cron (Authorization: Bearer CRON_SECRET); also the way to
// backfill by hand: call it until `pending` is 0. `?user=<id>` limits it to
// one account. Works through users for ~4 minutes per call.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const started = Date.now()
  const budgetMs = 240_000
  const only = new URL(req.url).searchParams.get('user')
  let query = f2Supabase().from('f2_users').select('id')
  if (only) query = query.eq('id', only)
  const { data: users, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const totals = { users: 0, topics: 0, indexed: 0, pending: 0, failed: 0 }
  for (const user of users ?? []) {
    const left = budgetMs - (Date.now() - started)
    const status = await ensureUserIndexed(user.id as string, { budgetMs: Math.max(0, left) })
    totals.users++
    totals.topics += status.topics
    totals.indexed += status.indexed
    totals.pending += status.pending
    totals.failed += status.failed
  }
  console.log('[f2/knowledge] backfill', JSON.stringify(totals), `${Date.now() - started} ms`)
  return NextResponse.json(totals)
}
