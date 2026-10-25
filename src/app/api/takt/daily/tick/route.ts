import { NextResponse } from 'next/server'
import { runTick } from '@/lib/takt/daily-send'

export const runtime = 'nodejs'
// One send can take 10–25 s.
export const maxDuration = 300

// GET /api/takt/daily/tick — Takt's daily text (Vercel Cron, hourly, Bearer CRON_SECRET, like
// /api/f2/daily/tick). Texts every verified, enabled user whose local hour is daily_hour and
// who has not had today's text, unless today's date is already in their progress snapshot's
// `days`. `?now=<ISO>` runs as of that instant; `?force=1&user=<id>` sends that one user now
// (ignoring the hour and daily_sent_on); `&dry=1` returns the text without sending.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  const now = q.get('now') ? new Date(q.get('now')!) : new Date()
  if (Number.isNaN(now.getTime())) return NextResponse.json({ error: 'bad now' }, { status: 400 })
  const force = q.get('force') === '1'
  const userId = q.get('user') ?? undefined
  if (force && !userId) return NextResponse.json({ error: 'force needs user' }, { status: 400 })
  const results = await runTick({ now, userId, force, dry: q.get('dry') === '1' })
  return NextResponse.json({ now: now.toISOString(), due: results.length, results })
}
