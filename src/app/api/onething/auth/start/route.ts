import { NextResponse } from 'next/server'
import { normalizePhone, startCode } from '@/lib/onething/core'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { phone?: string }
  const phone = normalizePhone(body.phone ?? '')
  if (!phone) {
    return NextResponse.json(
      { error: 'Enter your full phone number. Outside the US, start with the country code, like 44 7911 123456 (no leading 0).' },
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
