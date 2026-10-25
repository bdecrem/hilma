import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/takt/auth'
import { f2Supabase } from '@/lib/f2/supabase'
import { canResend, CODE_TTL_MS, normalizePhone } from '@/lib/takt/daily'
import { newCode, sendTaktText } from '@/lib/takt/daily-send'

export const runtime = 'nodejs'
// The code goes out synchronously; one imsghttp/BlueBubbles send can take 10–25 s.
export const maxDuration = 60

// POST /api/takt/daily/phone { phone } → { phone, verified: false }
// Stores the number (E.164, US default) unverified with a fresh 4-digit code (10 min) and
// texts "Takt code: 1234". One code per 60 s per user. A failed send is a 502; the code stays,
// so the user can still type it if the text arrives late.
export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { phone?: unknown } | null
  const phone = normalizePhone(body?.phone)
  if (!phone) return NextResponse.json({ error: 'That phone number doesn’t look right.' }, { status: 400 })

  const sb = f2Supabase()
  const { data: row, error: rErr } = await sb.from('takt_users').select('phone_code_expires_at').eq('id', user.id).single()
  if (rErr || !row) return NextResponse.json({ error: 'Could not read the account.' }, { status: 500 })
  const now = new Date()
  if (!canResend(now, row.phone_code_expires_at as string | null)) {
    return NextResponse.json({ error: 'A code was just sent. Wait a minute before asking for another.' }, { status: 429 })
  }

  const code = newCode()
  const { error } = await sb
    .from('takt_users')
    .update({
      phone,
      phone_verified_at: null,
      phone_code: code,
      phone_code_expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'Could not save the number.' }, { status: 500 })

  try {
    await sendTaktText(phone, `Takt code: ${code}`)
  } catch (e) {
    console.error('[takt/daily] code send failed (code kept):', e)
    return NextResponse.json({ error: 'Couldn\'t send the text. Try again in a minute.' }, { status: 502 })
  }
  return NextResponse.json({ phone, verified: false })
}

// DELETE /api/takt/daily/phone → { phone: null, verified: false }
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { error } = await f2Supabase()
    .from('takt_users')
    .update({ phone: null, phone_verified_at: null, phone_code: null, phone_code_expires_at: null })
    .eq('id', user.id)
  if (error) return NextResponse.json({ error: 'Could not remove the number.' }, { status: 500 })
  return NextResponse.json({ phone: null, verified: false })
}
