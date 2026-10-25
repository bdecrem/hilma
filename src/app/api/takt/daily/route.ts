import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { f2Supabase } from '@/lib/f2/supabase'
import { validHour, validTimeZone } from '@/lib/f2/daily-time'
import { readSettings, SETTINGS_COLUMNS, toSettings } from '@/lib/takt/daily-send'

export const runtime = 'nodejs'

// The daily text's settings (schema apps/takt/schema/002). Shape: { phone, verified, enabled,
// hour, tz }. Guests have them too (a guest is a takt_users row).

// GET /api/takt/daily
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  return NextResponse.json(await readSettings(user.id))
}

// PUT /api/takt/daily { enabled?, hour?, tz? }
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { enabled?: unknown; hour?: unknown; tz?: unknown } | null
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'JSON body required.' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'enabled must be true or false.' }, { status: 400 })
    patch.daily_enabled = body.enabled
  }
  if (body.hour !== undefined) {
    if (!validHour(body.hour)) return NextResponse.json({ error: 'hour must be a whole number 0–23.' }, { status: 400 })
    patch.daily_hour = body.hour
  }
  if (body.tz !== undefined) {
    if (!validTimeZone(body.tz)) return NextResponse.json({ error: 'tz must be an IANA time zone.' }, { status: 400 })
    patch.daily_tz = body.tz
  }
  if (Object.keys(patch).length === 0) return NextResponse.json(await readSettings(user.id))
  const { data, error } = await f2Supabase().from('takt_users').update(patch).eq('id', user.id).select(SETTINGS_COLUMNS).single()
  if (error || !data) return NextResponse.json({ error: 'Could not save the settings.' }, { status: 500 })
  return NextResponse.json(toSettings(data as Parameters<typeof toSettings>[0]))
}
