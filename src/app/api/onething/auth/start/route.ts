import { NextResponse } from 'next/server'
import { normalizePhone, startCode } from '@/lib/onething/core'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string; tz?: string; locale?: string }
  // The browser's zone and language say where a number typed without a country code belongs.
  const phone = normalizePhone(body.phone ?? '', { tz: body.tz, locale: body.locale })
  if (!phone) {
    return NextResponse.json(
      { error: 'That does not read as a phone number. Try it with the country code, like +44 7911 123456.' },
      { status: 400 },
    )
  }
  try {
    await startCode(phone)
  } catch (e) {
    console.error('[onething] code send failed', e)
    return NextResponse.json({ error: 'Could not text that number.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, phone })
}
