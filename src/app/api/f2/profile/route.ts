import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'
import { DEFAULT_DAILY_HOUR, DEFAULT_DAILY_TZ, validHour, validTimeZone } from '@/lib/f2/daily-time'

export const runtime = 'nodejs'

// GET /api/f2/profile — profile extras beyond /auth/me: the three daily
// texts (the card, Today's read, the voice checkin), their one send time, the
// Refresher toggle. Delivery of every daily text goes to the paired iMessage
// handle (or the per-user chat-guid override), so there is no separate phone
// number to manage.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { data } = await f2Supabase()
    .from('f2_users')
    .select('daily_card_enabled, imessage_handles, daily_chat_guid, recert_enabled, is_guest, voice_checkin_enabled, actively_read_enabled, daily_hour, daily_tz')
    .eq('id', user.id)
    .maybeSingle()
  const handles = (data?.imessage_handles as string[] | null) ?? []
  return NextResponse.json({
    daily_card_enabled: Boolean(data?.daily_card_enabled),
    imessage_paired: handles.length > 0 || data?.daily_chat_guid != null,
    recert_enabled: data?.recert_enabled !== false,
    // Daily Voice Checkin and Today's read: on by default; delivered to the paired handle.
    voice_checkin_enabled: data?.voice_checkin_enabled !== false,
    actively_read_enabled: data?.actively_read_enabled !== false,
    // The one send time for all of them: the user's local hour + zone (schema 057).
    daily_hour: typeof data?.daily_hour === 'number' ? data.daily_hour : DEFAULT_DAILY_HOUR,
    daily_tz: (data?.daily_tz as string | null) || DEFAULT_DAILY_TZ,
    is_guest: Boolean(data?.is_guest),
  })
}

type Body = {
  daily_card_enabled?: boolean
  recert_enabled?: boolean
  voice_checkin_enabled?: boolean
  actively_read_enabled?: boolean
  daily_hour?: number
  daily_tz?: string
}

const TOGGLES = ['daily_card_enabled', 'voice_checkin_enabled', 'actively_read_enabled'] as const
// The card and the checkin exist only as texts; Today's read also pushes and
// shows a banner in the app, so it can be on with nothing paired.
const NEEDS_HANDLE = ['daily_card_enabled', 'voice_checkin_enabled'] as const

// PUT /api/f2/profile — any of the fields above, together or alone; the
// reply echoes what was saved. Turning a daily text on requires a paired
// iMessage handle (that's where it goes).
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, boolean | number | string> = {}
  if (typeof body.recert_enabled === 'boolean') patch.recert_enabled = body.recert_enabled
  for (const key of TOGGLES) {
    if (typeof body[key] === 'boolean') patch[key] = body[key] as boolean
  }
  if (body.daily_hour !== undefined) {
    if (!validHour(body.daily_hour)) return NextResponse.json({ error: 'daily_hour must be 0–23' }, { status: 400 })
    patch.daily_hour = body.daily_hour
  }
  if (body.daily_tz !== undefined) {
    if (!validTimeZone(body.daily_tz)) return NextResponse.json({ error: 'daily_tz must be an IANA time zone' }, { status: 400 })
    patch.daily_tz = body.daily_tz
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to save' }, { status: 400 })
  }

  if (NEEDS_HANDLE.some((k) => patch[k] === true)) {
    const { data } = await f2Supabase()
      .from('f2_users')
      .select('imessage_handles, daily_chat_guid')
      .eq('id', user.id)
      .maybeSingle()
    const handles = (data?.imessage_handles as string[] | null) ?? []
    if (handles.length === 0 && data?.daily_chat_guid == null) {
      const what = patch.daily_card_enabled ? 'the daily card' : 'the daily voice checkin'
      return NextResponse.json(
        { error: `Pair iMessage first — ${what} is delivered there.` },
        { status: 409 },
      )
    }
  }

  const { error } = await f2Supabase().from('f2_users').update(patch).eq('id', user.id)
  if (error) {
    console.error('[f2/profile] update failed:', error)
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  }
  return NextResponse.json(patch)
}
