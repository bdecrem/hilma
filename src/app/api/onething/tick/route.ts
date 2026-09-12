import { NextResponse } from 'next/server'
import { normalizePhone, promptNow, tick } from '@/lib/onething/core'

// GET /api/onething/tick — hourly from Vercel Cron (Authorization: Bearer
// CRON_SECRET). 10am local sends the question, 10pm sends the reminder to
// anyone who has not answered. `?prompt=+1555…` sends the question to one
// number right now (same auth).
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = new URL(req.url)
  const one = url.searchParams.get('prompt')
  if (one) {
    const phone = normalizePhone(one)
    if (!phone) return NextResponse.json({ error: 'bad phone' }, { status: 400 })
    const user = await promptNow(phone)
    return NextResponse.json({ ok: true, prompted: [user.phone] })
  }
  const result = await tick()
  return NextResponse.json({ ok: true, ...result })
}
