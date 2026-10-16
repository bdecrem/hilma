import { NextResponse } from 'next/server'
import { sendActivelyReadNudges } from '@/lib/f2/actively-read'

export const runtime = 'nodejs'
// One BlueBubbles send can take 10-25s.
export const maxDuration = 300

// GET /api/f2/actively-read/nudge — a manual Today's read send (Bearer
// CRON_SECRET): `?force=1&user=<id>` sends one user theirs now, for checks.
// The scheduled send is /api/f2/daily/tick (every user's own hour) since
// 2026-10-16; this route was the fixed PT cron before that.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  if (q.get('force') !== '1' || !q.get('user')) {
    return NextResponse.json({ error: 'manual runs only: ?force=1&user=<id>; the schedule is /api/f2/daily/tick' }, { status: 400 })
  }
  const results = await sendActivelyReadNudges({ onlyUserId: q.get('user')! })
  return NextResponse.json({ results })
}
