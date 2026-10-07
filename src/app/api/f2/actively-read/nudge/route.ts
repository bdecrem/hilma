import { NextResponse } from 'next/server'
import { sendActivelyReadNudges } from '@/lib/f2/actively-read'

export const runtime = 'nodejs'
// One BlueBubbles send can take 10-25s.
export const maxDuration = 300

// GET /api/f2/actively-read/nudge — the noon send (Vercel Cron, Bearer
// CRON_SECRET). The cron fires at 19:00 and 20:00 UTC; only the run that is
// noon in Los Angeles sends. `?force=1&user=<id>` (same secret) sends now,
// to one user — for checks.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  const results = await sendActivelyReadNudges({
    force: q.get('force') === '1',
    onlyUserId: q.get('user') ?? undefined,
  })
  return NextResponse.json({ results })
}
