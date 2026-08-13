import { NextResponse } from 'next/server'
import { sendDailyCards } from '@/lib/f2/daily-card'

export const runtime = 'nodejs'
// One BlueBubbles send can take 10-25s; give a small user base headroom.
export const maxDuration = 300

// GET /api/f2/daily-card — the daily send, fired by Vercel Cron (which
// authenticates with `Authorization: Bearer ${CRON_SECRET}`). Sends one
// scheduler-picked flash card over iMessage to every user with a phone
// number on their profile.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const results = await sendDailyCards()
  return NextResponse.json({ results })
}
