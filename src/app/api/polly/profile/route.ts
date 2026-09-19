import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/polly/auth'
import { accountRootId } from '@/lib/polly/profiles'
import { isQuality } from '@/lib/polly/quality'
import { pollySupabase } from '@/lib/polly/supabase'

export const runtime = 'nodejs'

// GET /api/polly/profile — profile extras beyond /auth/me. The daily card is
// a toggle: delivery goes to the paired iMessage handle (or the per-user
// chat-guid override), so there is no separate phone number to manage.
export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  const { data } = await pollySupabase()
    .from('polly_users')
    .select('daily_card_enabled, imessage_handles, daily_chat_guid, recert_enabled, is_guest, content_quality')
    .eq('id', user.id)
    .maybeSingle()
  const handles = (data?.imessage_handles as string[] | null) ?? []
  return NextResponse.json({
    daily_card_enabled: Boolean(data?.daily_card_enabled),
    imessage_paired: handles.length > 0 || data?.daily_chat_guid != null,
    recert_enabled: data?.recert_enabled !== false,
    is_guest: Boolean(data?.is_guest),
    content_quality: isQuality(data?.content_quality) ? data.content_quality : 'fast',
  })
}

// PUT /api/polly/profile — flip the daily card on or off. Turning it on
// requires a paired iMessage handle (that's where the card goes).
export async function PUT(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  let body: { daily_card_enabled?: boolean; recert_enabled?: boolean; content_quality?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Content quality (Fast / Thorough) — account-wide: every language profile
  // of the account gets it (src/lib/polly/quality.ts).
  if (body.content_quality !== undefined) {
    if (!isQuality(body.content_quality)) {
      return NextResponse.json({ error: "content_quality must be 'fast' or 'deep'" }, { status: 400 })
    }
    const rootId = await accountRootId(user.id)
    const { error } = await pollySupabase()
      .from('polly_users')
      .update({ content_quality: body.content_quality })
      .or(`id.eq.${rootId},account_id.eq.${rootId}`)
    if (error) {
      console.error('[polly/profile] content_quality update failed:', error)
      return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
    }
    if (typeof body.recert_enabled !== 'boolean' && typeof body.daily_card_enabled !== 'boolean') {
      return NextResponse.json({ content_quality: body.content_quality })
    }
  }

  // The Refresher toggle — independent of the daily card.
  if (typeof body.recert_enabled === 'boolean') {
    const { error } = await pollySupabase()
      .from('polly_users')
      .update({ recert_enabled: body.recert_enabled })
      .eq('id', user.id)
    if (error) {
      console.error('[polly/profile] recert_enabled update failed:', error)
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
    const { data } = await pollySupabase()
      .from('polly_users')
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

  const { error } = await pollySupabase()
    .from('polly_users')
    .update({ daily_card_enabled: enabled })
    .eq('id', user.id)
  if (error) {
    console.error('[polly/profile] daily_card_enabled update failed:', error)
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  }
  return NextResponse.json({ daily_card_enabled: enabled })
}
