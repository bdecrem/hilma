import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { storeInbound } from '@/lib/kochito/mail'

export const runtime = 'nodejs'
export const maxDuration = 30

// POST /api/kochito/mail/in?t=<KOCHITO_MAIL_TOKEN>
// SendGrid Inbound Parse posts every message sent to an address at
// kochitolabs.com, clerkpdf.com or appadopt.com here. The token in the URL is
// the only thing that says the post is SendGrid's; a wrong one is a 404.
export async function POST(req: Request) {
  const want = process.env.KOCHITO_MAIL_TOKEN
  const got = new URL(req.url).searchParams.get('t') ?? ''
  if (!want || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return NextResponse.json({ error: 'not found' }, { status: 404 })
  try {
    await storeInbound(await req.formData())
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[kochito/mail/in] failed:', e)
    // a 5xx makes SendGrid retry for up to three days, which is what we want if the database blinked
    return NextResponse.json({ error: 'not stored' }, { status: 500 })
  }
}
