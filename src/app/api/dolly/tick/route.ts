import { NextResponse } from 'next/server'
import { tick } from '@/lib/dolly/tick'

// GET /api/dolly/tick — hourly from Vercel Cron (Authorization: Bearer
// CRON_SECRET): each user's daily text at their hour, the 8 pm reminder.
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await tick()
  return NextResponse.json({ ok: true, ...result })
}
