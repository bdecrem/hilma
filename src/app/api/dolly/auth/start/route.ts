import { NextResponse } from 'next/server'
import { normalizePhone, startCode } from '@/lib/dolly/auth'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/dolly/auth/start { phone, tz?, locale? } — text a code to that
// number. The phone's zone and language place a number typed without a
// country code.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; tz?: string; locale?: string }
  const phone = normalizePhone(body.phone ?? '', { tz: body.tz, locale: body.locale })
  if (!phone) {
    return NextResponse.json({ error: 'That does not read as a phone number. Try it with the country code, like +1 415 555 0123.' }, { status: 400 })
  }
  try {
    await startCode(phone)
  } catch (e) {
    console.error('[dolly] code send failed', e)
    return NextResponse.json({ error: 'Could not text that number.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, phone })
}
