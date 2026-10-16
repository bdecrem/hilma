import { NextResponse } from 'next/server'
import { dueUsers } from '@/lib/f2/daily-time'
import { sendDailyCards } from '@/lib/f2/daily-card'
import { sendActivelyReadNudges } from '@/lib/f2/actively-read'
import { sendVoiceCheckins } from '@/lib/f2/voice-checkin'

export const runtime = 'nodejs'
// One BlueBubbles send can take 10-25s, and a checkin pick writes a question.
export const maxDuration = 300

// GET /api/f2/daily/tick — the one daily send (Vercel Cron, every hour on the
// hour, Bearer CRON_SECRET). Every user has one send time (Settings → Daily
// card → Send at; f2_users.daily_hour in daily_tz, schema 057); the users
// whose hour is now get whatever they have on, in this order: the daily card,
// Today's read, the Daily Voice Checkin. The order matters for replies over
// iMessage: the text that went out LAST owns a "2" or a "9" (agent.ts), so
// the checkin's "9" and the read's "2" keep working when all three land in
// the same minute, and anything else is the card's answer.
// Replaced the three fixed PT crons (9 am card, noon read, 5 pm checkin) on
// 2026-10-16. `?now=<ISO>` with the secret runs the tick as of that instant,
// and `&user=<id>` limits it to one user — together they are the check.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const q = new URL(req.url).searchParams
  const now = q.get('now') ? new Date(q.get('now')!) : new Date()
  if (Number.isNaN(now.getTime())) return NextResponse.json({ error: 'bad now' }, { status: 400 })

  const userIds = await dueUsers(now, q.get('user') ?? undefined)
  if (userIds.length === 0) return NextResponse.json({ now: now.toISOString(), due: 0 })
  const card = await sendDailyCards({ userIds })
  const read = await sendActivelyReadNudges({ now, userIds })
  const checkin = await sendVoiceCheckins({ now, userIds })
  return NextResponse.json({ now: now.toISOString(), due: userIds.length, card, read, checkin })
}
