import { NextResponse } from 'next/server'
import { sweepMinutes } from '@/lib/venture/minutes-store'

export const runtime = 'nodejs'
export const maxDuration = 300

// GET /api/venture/minutes/sweep (Vercel cron, every five minutes, Bearer CRON_SECRET): minutes for
// every voice call that is over and every voice note of the last day that has none yet (a phone
// that never said the meeting ended, the talk page). See src/lib/venture/minutes.ts.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return NextResponse.json(await sweepMinutes())
}
