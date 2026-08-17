import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/f2/auth'
import { f2Supabase } from '@/lib/f2/supabase'

export const runtime = 'nodejs'

// GET /api/f2/profile — profile extras beyond /auth/me. The daily card is
// a toggle: delivery goes to the paired iMessage handle (or the per-user
// chat-guid override), so there is no separate phone number to manage.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { data } = await f2Supabase()
    .from('f2_users')
    .select('daily_card_enabled, imessage_handles, daily_chat_guid, recert_enabled, is_guest')
    .eq('id', user.id)
    .maybeSingle()
  const handles = (data?.imessage_handles as string[] | null) ?? []
  return NextResponse.json({
    daily_card_enabled: Boolean(data?.daily_card_enabled),
    imessage_paired: handles.length > 0 || data?.daily_chat_guid != null,
    recert_enabled: data?.recert_enabled !== false,
    is_guest: Boolean(data?.is_guest),
  })
}

// PUT /api/f2/profile — flip the daily card on or off. Turning it on
// requires a paired iMessage handle (that's where the card goes).
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { daily_card_enabled?: boolean; recert_enabled?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // The Refresher toggle — independent of the daily card.
  if (typeof body.recert_enabled === 'boolean') {
    const { error } = await f2Supabase()
      .from('f2_users')
      .update({ recert_enabled: body.recert_enabled })
      .eq('id', user.id)
    if (error) {
      console.error('[f2/profile] recert_enabled update failed:', error)
      return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
    }
    if (typeof body.daily_card_enabled !== 'boolean') {
      return NextResponse.json({ recert_enabled: body.recert_enabled })
    }
  }

  if (typeof body.daily_card_enabled !== 'boolean') {
    return NextResponse.json({ error: 'daily_card_enabled required' }, { status: 400 })
  }
  const enabled = body.daily_card_enabled

  if (enabled) {
    const { data } = await f2Supabase()
      .from('f2_users')
      .select('imessage_handles, daily_chat_guid')
      .eq('id', user.id)
      .maybeSingle()
    const handles = (data?.imessage_handles as string[] | null) ?? []
    if (handles.length === 0 && data?.daily_chat_guid == null) {
      return NextResponse.json(
        { error: 'Pair iMessage first — the daily card is delivered there.' },
        { status: 409 },
      )
    }
  }

  const { error } = await f2Supabase()
    .from('f2_users')
    .update({ daily_card_enabled: enabled })
    .eq('id', user.id)
  if (error) {
    console.error('[f2/profile] daily_card_enabled update failed:', error)
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  }
  return NextResponse.json({ daily_card_enabled: enabled })
}
